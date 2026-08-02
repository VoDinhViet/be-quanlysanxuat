import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { BomItemType, bomItems, boms } from '../schemas/boms';
import { credentials } from '../schemas/credentials';
import { productGroups } from '../schemas/product-groups';
import { ProductType, products } from '../schemas/products';
import { units } from '../schemas/units';

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

// Same formatting rule as `BomsService`'s ltree helper (`src/api/boms/utils/ltree.util.ts`) —
// duplicated rather than imported so this standalone script doesn't reach into `src/api/`.
function formatLtreeNodeId(id: string): string {
  return 'n_' + id.replace(/-/g, '_');
}

interface ProductSeed {
  code: string;
  name: string;
}

/**
 * A curated, hand-linked set: every WORK_IN_PROGRESS row below is referenced by at least one BOM
 * tree in `BOM_TREES`, so the seeded data demonstrates the BOM/routing features end-to-end
 * instead of being a pile of unrelated rows. All use unit "CAI" and group "THANH_PHAM".
 */
const FG_PRODUCTS: ProductSeed[] = [
  { code: 'BAN-LV', name: 'Bàn làm việc' },
  { code: 'TU-TL', name: 'Tủ tài liệu' },
];

// Same idea, group "LINH_KIEN".
const WIP_PRODUCTS: ProductSeed[] = [
  { code: 'MAT-BAN', name: 'Mặt bàn' },
  { code: 'CHAN-BAN', name: 'Chân bàn' },
  { code: 'KHUNG-BAN', name: 'Khung bàn' },
  { code: 'THAN-TU', name: 'Thân tủ' },
  { code: 'CANH-TU', name: 'Cánh tủ' },
  { code: 'NGAN-KEO', name: 'Ngăn kéo' },
];

interface BomNodeSeed {
  code: string;
  quantity: number;
  children?: BomNodeSeed[];
}

// Keyed by FG product code. "Khung bàn" nests "Chân bàn" one level down so the seeded tree
// exercises `parentId` (2 levels deep), not just a flat list of top-level items.
const BOM_TREES: Record<string, BomNodeSeed[]> = {
  'BAN-LV': [
    { code: 'MAT-BAN', quantity: 1 },
    {
      code: 'KHUNG-BAN',
      quantity: 1,
      children: [{ code: 'CHAN-BAN', quantity: 4 }],
    },
  ],
  'TU-TL': [
    { code: 'THAN-TU', quantity: 1 },
    { code: 'CANH-TU', quantity: 2 },
    { code: 'NGAN-KEO', quantity: 3 },
  ],
};

interface EnsureProductSpec {
  code: string;
  name: string;
  type: ProductType;
  unitId: string;
  productGroupId: string | null;
  createdBy: string | null;
}

/** Idempotent by `code`. Mirrors `ProductsService.createProduct`'s shape (plain product insert,
 * no revision bookkeeping since the revision layer was removed in favor of whole-product
 * copy/clone). */
async function ensureProduct(
  db: SeedDatabase,
  spec: EnsureProductSpec,
): Promise<{ id: string }> {
  const existing = await db.query.products.findFirst({
    where: eq(products.code, spec.code),
    columns: { id: true },
  });

  if (existing) {
    console.log(`Product "${spec.code}" already exists. Skipping.`);
    return { id: existing.id };
  }

  const [product] = await db
    .insert(products)
    .values({
      code: spec.code,
      name: spec.name,
      type: spec.type,
      unitId: spec.unitId,
      productGroupId: spec.productGroupId,
      createdBy: spec.createdBy,
    })
    .returning({ id: products.id });

  console.log(`Product "${spec.code}" (${spec.name}) created.`);

  return { id: product.id };
}

/** Idempotent by `boms.productId` (unique) — skips if this FG already has a BOM. */
async function ensureBomTree(
  db: SeedDatabase,
  fgProductCode: string,
  fgProductId: string,
  wipIdByCode: Map<string, string>,
  createdBy: string | null,
): Promise<void> {
  const nodes = BOM_TREES[fgProductCode];

  if (!nodes) {
    return;
  }

  const existingBom = await db.query.boms.findFirst({
    where: eq(boms.productId, fgProductId),
    columns: { id: true },
  });

  if (existingBom) {
    console.log(`BOM for "${fgProductCode}" already exists. Skipping.`);
    return;
  }

  await db.transaction(async (tx) => {
    const [bom] = await tx
      .insert(boms)
      .values({ productId: fgProductId, createdBy })
      .returning({ id: boms.id });

    // Nested closure over `tx` instead of a top-level helper taking `tx` as a param — sidesteps
    // typing drizzle's transaction callback param and keeps the recursion scoped to this one BOM.
    // Mirrors `BomsService.addBomItem`'s path/level computation so seeded rows look the same to
    // readers as ones created through the API.
    async function insertNodes(
      parentId: string | null,
      parentPath: string | null,
      level: number,
      siblings: BomNodeSeed[],
    ): Promise<void> {
      for (const [index, node] of siblings.entries()) {
        const productId = wipIdByCode.get(node.code);

        if (!productId) {
          throw new Error(
            `BOM tree references unknown WIP product code "${node.code}".`,
          );
        }

        const itemId = crypto.randomUUID();
        const nodeKey = formatLtreeNodeId(itemId);
        const itemPath = parentPath ? `${parentPath}.${nodeKey}` : nodeKey;

        await tx.insert(bomItems).values({
          id: itemId,
          bomId: bom.id,
          parentId,
          itemType: BomItemType.PRODUCT,
          productId,
          materialId: null,
          quantity: node.quantity,
          path: itemPath,
          level,
          sortOrder: index,
          createdBy,
        });

        if (node.children?.length) {
          await insertNodes(itemId, itemPath, level + 1, node.children);
        }
      }
    }

    await insertNodes(null, null, 1, nodes);
  });

  console.log(`BOM tree for "${fgProductCode}" created.`);
}

export async function seedProducts(db: SeedDatabase): Promise<void> {
  const unit = await db.query.units.findFirst({
    where: eq(units.code, 'CAI'),
    columns: { id: true },
  });

  if (!unit) {
    throw new Error('Unit "CAI" not found — run `pnpm db:seed:units` first.');
  }

  const admin = await db.query.credentials.findFirst({
    where: eq(credentials.username, 'admin'),
    columns: { userId: true },
  });

  if (!admin) {
    console.warn(
      'Credential "admin" not found — seeded products will have createdBy = null. Run `pnpm db:seed:credentials` first for a complete seed.',
    );
  }

  const createdBy = admin?.userId ?? null;

  const groups = await db.query.productGroups.findMany({
    where: inArray(productGroups.code, ['THANH_PHAM', 'LINH_KIEN']),
    columns: { id: true, code: true },
  });
  const groupIdByCode = new Map(groups.map((group) => [group.code, group.id]));

  if (groupIdByCode.size < 2) {
    console.warn(
      'Product groups "THANH_PHAM"/"LINH_KIEN" not fully found — seeded products will have productGroupId = null where missing. Run `pnpm db:seed:product-groups` first for a complete seed.',
    );
  }

  // WIP first — the BOM trees below reference these ids, so they must exist before any FG.
  const wipIdByCode = new Map<string, string>();
  for (const spec of WIP_PRODUCTS) {
    const product = await ensureProduct(db, {
      ...spec,
      type: ProductType.WORK_IN_PROGRESS,
      unitId: unit.id,
      productGroupId: groupIdByCode.get('LINH_KIEN') ?? null,
      createdBy,
    });
    wipIdByCode.set(spec.code, product.id);
  }

  for (const spec of FG_PRODUCTS) {
    const product = await ensureProduct(db, {
      ...spec,
      type: ProductType.FINISHED_GOOD,
      unitId: unit.id,
      productGroupId: groupIdByCode.get('THANH_PHAM') ?? null,
      createdBy,
    });

    await ensureBomTree(db, spec.code, product.id, wipIdByCode, createdBy);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedProducts(db);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed products:', error);
      process.exit(1);
    });
}
