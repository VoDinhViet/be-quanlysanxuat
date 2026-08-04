import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { bomItemMaterials } from '../schemas/products/bom-item-materials';
import { bomItems } from '../schemas/products/bom-items';
import { boms } from '../schemas/products/boms';
import { credentials } from '../schemas/identity-access/credentials';
import { materials } from '../schemas/materials/materials';
import { operations } from '../schemas/operations';
import { productGroups } from '../schemas/products/product-groups';
import { ProductType, products } from '../schemas/products/products';
import { routingSteps } from '../schemas/products/routing-steps';
import { units } from '../schemas/units/units';

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

interface MaterialLeafSeed {
  code: string;
  quantity: number;
}

/**
 * Each WIP's own BOM — the raw materials it's fabricated from — keyed by WIP product code.
 * Independent of `BOM_TREES` above: this is what you'd see navigating to e.g. "Chân bàn" as its
 * own product, not the "as-used" position inside "Bàn làm việc".
 */
const WIP_MATERIAL_BOMS: Record<string, MaterialLeafSeed[]> = {
  'MAT-BAN': [
    { code: 'THEP-TAM-10', quantity: 1 },
    { code: 'SON-DEN', quantity: 0.3 },
  ],
  'CHAN-BAN': [
    { code: 'ONG-INOX-D27', quantity: 1 },
    { code: 'BULONG-M8', quantity: 2 },
  ],
  'KHUNG-BAN': [
    { code: 'THEP-TAM-5', quantity: 1 },
    { code: 'BULONG-M10', quantity: 4 },
    { code: 'SON-DEN', quantity: 0.5 },
  ],
  'THAN-TU': [
    { code: 'THEP-TAM-10', quantity: 2 },
    { code: 'BULONG-M10', quantity: 8 },
  ],
  'CANH-TU': [
    { code: 'THEP-TAM-5', quantity: 1 },
    { code: 'SON-TRANG', quantity: 0.2 },
  ],
  'NGAN-KEO': [
    { code: 'THEP-TAM-5', quantity: 1 },
    { code: 'ONG-INOX-D21', quantity: 1 },
    { code: 'BULONG-M8', quantity: 4 },
  ],
};

// As-used routing (`routing_steps.bomItemId`) for a WIP's node at its position inside a parent
// tree in `BOM_TREES` — the fabrication steps that specific node goes through.
const WIP_ROUTING: Record<string, string[]> = {
  'MAT-BAN': ['CAT_LASER', 'CHAN', 'MAI', 'SON_TINH_DIEN'],
  'CHAN-BAN': ['CAT_LASER', 'CHAN', 'HAN', 'MAI', 'SON_TINH_DIEN'],
  'KHUNG-BAN': ['CAT_LASER', 'CHAN', 'HAN', 'MAI', 'SON_TINH_DIEN'],
  'THAN-TU': ['CAT_LASER', 'CHAN', 'HAN', 'MAI', 'SON_TINH_DIEN'],
  'CANH-TU': ['CAT_LASER', 'CHAN', 'MAI', 'SON_TINH_DIEN'],
  'NGAN-KEO': ['CAT_LASER', 'CHAN', 'HAN', 'MAI'],
};

// Cấp 0 routing (`routing_steps.productId`) for the FG root itself — final assembly, run after
// every child part is fabricated.
const FG_ROUTING: Record<string, string[]> = {
  'BAN-LV': ['LAP_RAP_TONG', 'DONG_GOI'],
  'TU-TL': ['LAP_RAP_TONG', 'DONG_GOI'],
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
  operationIdByCode: Map<string, string>,
  materialIdByCode: Map<string, string>,
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
      startIndex = 0,
    ): Promise<void> {
      for (const [offset, node] of siblings.entries()) {
        const index = startIndex + offset;
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
          productId,
          quantity: node.quantity,
          path: itemPath,
          level,
          sortOrder: index,
          createdBy,
        });

        const routingCodes = WIP_ROUTING[node.code];
        if (routingCodes?.length) {
          for (const [stepIndex, opCode] of routingCodes.entries()) {
            const operationId = operationIdByCode.get(opCode);

            if (!operationId) {
              throw new Error(
                `Routing references unknown operation code "${opCode}".`,
              );
            }

            await tx.insert(routingSteps).values({
              bomItemId: itemId,
              operationId,
              sortOrder: stepIndex,
              createdBy,
            });
          }
        }

        // Vật tư as-used của node này (không chỉ trong BOM riêng của WIP) — đọc BOM sản phẩm
        // không đệ quy xuống BOM con, nên thiếu bước này cây của FG sẽ chỉ có cấu trúc, không có
        // vật tư (`docs/domains/product-structure.md`).
        const materialLeaves = WIP_MATERIAL_BOMS[node.code] ?? [];
        for (const [leafIndex, leaf] of materialLeaves.entries()) {
          const materialId = materialIdByCode.get(leaf.code);

          if (!materialId) {
            throw new Error(
              `WIP material BOM references unknown material code "${leaf.code}".`,
            );
          }

          await tx.insert(bomItemMaterials).values({
            bomId: bom.id,
            bomItemId: itemId,
            materialId,
            quantity: leaf.quantity,
            sortOrder: leafIndex,
            createdBy,
          });
        }

        if (node.children?.length) {
          await insertNodes(itemId, itemPath, level + 1, node.children);
        }
      }
    }

    await insertNodes(null, null, 1, nodes);
  });

  console.log(`BOM tree for "${fgProductCode}" created.`);
}

/** Idempotent by `boms.productId` (unique) — a WIP's own BOM, made of raw material leaves. */
async function ensureWipMaterialBom(
  db: SeedDatabase,
  wipCode: string,
  wipProductId: string,
  materialIdByCode: Map<string, string>,
  createdBy: string | null,
): Promise<void> {
  const leaves = WIP_MATERIAL_BOMS[wipCode];

  if (!leaves) {
    return;
  }

  const existingBom = await db.query.boms.findFirst({
    where: eq(boms.productId, wipProductId),
    columns: { id: true },
  });

  if (existingBom) {
    console.log(`Material BOM for "${wipCode}" already exists. Skipping.`);
    return;
  }

  await db.transaction(async (tx) => {
    const [bom] = await tx
      .insert(boms)
      .values({ productId: wipProductId, createdBy })
      .returning({ id: boms.id });

    for (const [index, leaf] of leaves.entries()) {
      const materialId = materialIdByCode.get(leaf.code);

      if (!materialId) {
        throw new Error(
          `WIP material BOM references unknown material code "${leaf.code}".`,
        );
      }

      await tx.insert(bomItemMaterials).values({
        bomId: bom.id,
        bomItemId: null,
        materialId,
        quantity: leaf.quantity,
        sortOrder: index,
        createdBy,
      });
    }
  });

  console.log(`Material BOM for "${wipCode}" created.`);
}

/** Idempotent by `routingSteps.productId` — skips the whole set if this product (FG or WIP)
 * already has Cấp 0 routing. Used for every root product, not just FG: a WIP fully has its own
 * routing too, independent of the as-used routing on its bom_item position elsewhere. */
async function ensureRootRouting(
  db: SeedDatabase,
  rootProductId: string,
  operationCodes: string[],
  operationIdByCode: Map<string, string>,
  createdBy: string | null,
): Promise<void> {
  const existing = await db.query.routingSteps.findFirst({
    where: eq(routingSteps.productId, rootProductId),
    columns: { id: true },
  });

  if (existing) {
    return;
  }

  await db.transaction(async (tx) => {
    for (const [index, code] of operationCodes.entries()) {
      const operationId = operationIdByCode.get(code);

      if (!operationId) {
        throw new Error(`Routing references unknown operation code "${code}".`);
      }

      await tx.insert(routingSteps).values({
        productId: rootProductId,
        operationId,
        sortOrder: index,
        createdBy,
      });
    }
  });
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

  const materialCodes = [
    ...new Set(
      Object.values(WIP_MATERIAL_BOMS).flatMap((leaves) =>
        leaves.map((leaf) => leaf.code),
      ),
    ),
  ];
  const materialRows = await db.query.materials.findMany({
    where: inArray(materials.code, materialCodes),
    columns: { id: true, code: true },
  });
  const materialIdByCode = new Map(
    materialRows.map((material) => [material.code, material.id]),
  );

  const missingMaterialCodes = materialCodes.filter(
    (code) => !materialIdByCode.has(code),
  );
  if (missingMaterialCodes.length > 0) {
    throw new Error(
      `Materials not found: ${missingMaterialCodes.join(', ')} — run \`pnpm db:seed:materials\` first.`,
    );
  }

  const operationCodes = [
    ...new Set([
      ...Object.values(WIP_ROUTING).flat(),
      ...Object.values(FG_ROUTING).flat(),
    ]),
  ];
  const operationRows = await db.query.operations.findMany({
    where: inArray(operations.code, operationCodes),
    columns: { id: true, code: true },
  });
  const operationIdByCode = new Map(
    operationRows.map((operation) => [operation.code, operation.id]),
  );

  const missingOperationCodes = operationCodes.filter(
    (code) => !operationIdByCode.has(code),
  );
  if (missingOperationCodes.length > 0) {
    throw new Error(
      `Operations not found: ${missingOperationCodes.join(', ')} — run \`pnpm db:seed:operations\` first.`,
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

    await ensureWipMaterialBom(
      db,
      spec.code,
      product.id,
      materialIdByCode,
      createdBy,
    );

    await ensureRootRouting(
      db,
      product.id,
      WIP_ROUTING[spec.code] ?? [],
      operationIdByCode,
      createdBy,
    );
  }

  for (const spec of FG_PRODUCTS) {
    const product = await ensureProduct(db, {
      ...spec,
      type: ProductType.FINISHED_GOOD,
      unitId: unit.id,
      productGroupId: groupIdByCode.get('THANH_PHAM') ?? null,
      createdBy,
    });

    await ensureBomTree(
      db,
      spec.code,
      product.id,
      wipIdByCode,
      operationIdByCode,
      materialIdByCode,
      createdBy,
    );

    await ensureRootRouting(
      db,
      product.id,
      FG_ROUTING[spec.code] ?? [],
      operationIdByCode,
      createdBy,
    );
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
