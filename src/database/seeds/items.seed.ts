import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { credentials } from '../schemas/identity-access/credentials';
import { bomItems } from '../schemas/items/bom-items';
import { bomOperations } from '../schemas/items/bom-operations';
import { boms } from '../schemas/items/boms';
import { ItemType, items } from '../schemas/items/items';
import { routingOperations } from '../schemas/items/routing-operations';
import { routings } from '../schemas/items/routings';
import { operations } from '../schemas/operations';
import { units } from '../schemas/units/units';

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

interface MaterialSeed {
  code: string;
  name: string;
  unitCode: string;
  materialGrade?: string;
  dimensions?: string;
  specificWeight?: number;
  colorSurface?: string;
  origin?: string;
}

/** Curated raw materials (RM), so `GET /items?type=RM` has something real to filter/search on
 * right after the reference-data seeds run. */
const MATERIALS: MaterialSeed[] = [
  {
    code: 'THEP-TAM-5',
    name: 'Thép tấm 5mm',
    unitCode: 'TAM',
    dimensions: '1000x2000x5mm',
    specificWeight: 7.85,
    materialGrade: 'SS400',
    origin: 'Việt Nam',
  },
  {
    code: 'THEP-TAM-10',
    name: 'Thép tấm 10mm',
    unitCode: 'TAM',
    dimensions: '1000x2000x10mm',
    specificWeight: 7.85,
    materialGrade: 'SS400',
  },
  {
    code: 'THEP-CUON-2',
    name: 'Thép cuộn 2mm',
    unitCode: 'KG',
    specificWeight: 7.85,
    materialGrade: 'SPCC',
  },
  {
    code: 'ONG-INOX-D21',
    name: 'Ống inox Ø21',
    unitCode: 'CAY',
    dimensions: 'Ø21x1.2mm',
    materialGrade: 'SUS304',
  },
  {
    code: 'ONG-INOX-D27',
    name: 'Ống inox Ø27',
    unitCode: 'CAY',
    dimensions: 'Ø27x1.2mm',
    materialGrade: 'SUS304',
  },
  {
    code: 'NHOM-TAM-3',
    name: 'Nhôm tấm 3mm',
    unitCode: 'TAM',
    specificWeight: 2.7,
    materialGrade: 'A5052',
  },
  {
    code: 'BULONG-M8',
    name: 'Bu lông M8x20',
    unitCode: 'CAI',
    dimensions: 'M8x20mm',
  },
  {
    code: 'BULONG-M10',
    name: 'Bu lông M10x25',
    unitCode: 'CAI',
    dimensions: 'M10x25mm',
  },
  {
    code: 'SON-DEN',
    name: 'Sơn tĩnh điện màu đen',
    unitCode: 'KG',
    colorSurface: 'Đen (RAL9005)',
  },
  {
    code: 'SON-TRANG',
    name: 'Sơn tĩnh điện màu trắng',
    unitCode: 'KG',
    colorSurface: 'Trắng (RAL9003)',
  },
];

interface ItemSeed {
  code: string;
  name: string;
}

/**
 * A curated, hand-linked set: every WIP row below is referenced by at least one BOM tree in
 * `BOM_TREES`, so the seeded data demonstrates the BOM/routing features end-to-end instead of
 * being a pile of unrelated rows. All use unit "CAI".
 */
const FG_ITEMS: ItemSeed[] = [
  { code: 'BAN-LV', name: 'Bàn làm việc' },
  { code: 'TU-TL', name: 'Tủ tài liệu' },
];

const WIP_ITEMS: ItemSeed[] = [
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

// Keyed by FG item code. "Khung bàn" nests "Chân bàn" one level down so the seeded tree exercises
// `parentId` (2 levels deep), not just a flat list of top-level items.
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
 * Raw materials (RM) each WIP is fabricated from, as-used at its node position inside the parent
 * FG tree (`BOM_TREES`) — keyed by WIP item code. Inserted as RM leaf rows directly into
 * `bom_items` (no separate `bom_materials` table, see `docs/decisions/items-merge.md`).
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

// As-used routing (`bom_operations.bomItemId`) for a WIP's node at its position inside a parent
// tree in `BOM_TREES` — the fabrication steps that specific node goes through. Also doubles as
// that WIP's own Cấp 0 routing (`routings`/`routing_operations`) via `ensureRootOperations`.
const WIP_ROUTING: Record<string, string[]> = {
  'MAT-BAN': ['CAT_LASER', 'CHAN', 'MAI', 'SON_TINH_DIEN'],
  'CHAN-BAN': ['CAT_LASER', 'CHAN', 'HAN', 'MAI', 'SON_TINH_DIEN'],
  'KHUNG-BAN': ['CAT_LASER', 'CHAN', 'HAN', 'MAI', 'SON_TINH_DIEN'],
  'THAN-TU': ['CAT_LASER', 'CHAN', 'HAN', 'MAI', 'SON_TINH_DIEN'],
  'CANH-TU': ['CAT_LASER', 'CHAN', 'MAI', 'SON_TINH_DIEN'],
  'NGAN-KEO': ['CAT_LASER', 'CHAN', 'HAN', 'MAI'],
};

// Cấp 0 routing (`routings`/`routing_operations`) for the FG root itself — final assembly, run
// after every child part is fabricated.
const FG_ROUTING: Record<string, string[]> = {
  'BAN-LV': ['LAP_RAP_TONG', 'DONG_GOI'],
  'TU-TL': ['LAP_RAP_TONG', 'DONG_GOI'],
};

interface EnsureItemSpec {
  code: string;
  name: string;
  type: ItemType;
  unitId: string;
  createdBy: string | null;
}

/** Idempotent by `code`. */
async function ensureItem(
  db: SeedDatabase,
  spec: EnsureItemSpec,
): Promise<{ id: string }> {
  const existing = await db.query.items.findFirst({
    where: eq(items.code, spec.code),
    columns: { id: true },
  });

  if (existing) {
    console.log(`Item "${spec.code}" already exists. Skipping.`);
    return { id: existing.id };
  }

  const [item] = await db
    .insert(items)
    .values({
      code: spec.code,
      name: spec.name,
      type: spec.type,
      unitId: spec.unitId,
      createdBy: spec.createdBy,
    })
    .returning({ id: items.id });

  console.log(`Item "${spec.code}" (${spec.name}) created.`);

  return { id: item.id };
}

/** Idempotent by `boms.itemId` (unique) — skips if this FG already has a BOM. */
async function ensureBomTree(
  db: SeedDatabase,
  fgItemCode: string,
  fgItemId: string,
  wipIdByCode: Map<string, string>,
  operationIdByCode: Map<string, string>,
  materialIdByCode: Map<string, string>,
  createdBy: string | null,
): Promise<void> {
  const nodes = BOM_TREES[fgItemCode];

  if (!nodes) {
    return;
  }

  const existingBom = await db.query.boms.findFirst({
    where: eq(boms.itemId, fgItemId),
    columns: { id: true },
  });

  if (existingBom) {
    console.log(`BOM for "${fgItemCode}" already exists. Skipping.`);
    return;
  }

  await db.transaction(async (tx) => {
    const [bom] = await tx
      .insert(boms)
      .values({ itemId: fgItemId, createdBy })
      .returning({ id: boms.id });

    // Nested closure over `tx` instead of a top-level helper taking `tx` as a param — sidesteps
    // typing drizzle's transaction callback param and keeps the recursion scoped to this one BOM.
    // Mirrors `BomsService.createBomItem`'s level computation so seeded rows look the same to
    // readers as ones created through the API.
    async function insertNodes(
      parentId: string | null,
      level: number,
      siblings: BomNodeSeed[],
      startIndex = 0,
    ): Promise<void> {
      for (const [offset, node] of siblings.entries()) {
        const index = startIndex + offset;
        const wipItemId = wipIdByCode.get(node.code);

        if (!wipItemId) {
          throw new Error(
            `BOM tree references unknown WIP item code "${node.code}".`,
          );
        }

        const bomItemId = crypto.randomUUID();

        await tx.insert(bomItems).values({
          id: bomItemId,
          bomId: bom.id,
          parentId,
          itemId: wipItemId,
          quantity: node.quantity,
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

            await tx.insert(bomOperations).values({
              bomItemId,
              operationId,
              sortOrder: stepIndex,
              createdBy,
            });
          }
        }

        // Vật tư as-used của node này — lá RM ngay trong bom_items (không đọc BOM sản phẩm đệ quy
        // xuống BOM con nên thiếu bước này cây của FG sẽ chỉ có cấu trúc, không có vật tư).
        const materialLeaves = WIP_MATERIAL_BOMS[node.code] ?? [];
        for (const [leafIndex, leaf] of materialLeaves.entries()) {
          const materialItemId = materialIdByCode.get(leaf.code);

          if (!materialItemId) {
            throw new Error(
              `WIP material BOM references unknown material code "${leaf.code}".`,
            );
          }

          await tx.insert(bomItems).values({
            id: crypto.randomUUID(),
            bomId: bom.id,
            parentId: bomItemId,
            itemId: materialItemId,
            quantity: leaf.quantity,
            level: level + 1,
            sortOrder: leafIndex,
            createdBy,
          });
        }

        if (node.children?.length) {
          await insertNodes(bomItemId, level + 1, node.children);
        }
      }
    }

    await insertNodes(null, 1, nodes);
  });

  console.log(`BOM tree for "${fgItemCode}" created.`);
}

/** Idempotent by `routings.itemId` (unique) — skips if this item (FG or WIP) already has a Cấp 0
 * routing. Used for every root item, not just FG: a WIP fully has its own routing too,
 * independent of the as-used routing on its bom_item position elsewhere. */
async function ensureRootOperations(
  db: SeedDatabase,
  rootItemId: string,
  operationCodes: string[],
  operationIdByCode: Map<string, string>,
  createdBy: string | null,
): Promise<void> {
  if (!operationCodes.length) {
    return;
  }

  const existing = await db.query.routings.findFirst({
    where: eq(routings.itemId, rootItemId),
    columns: { id: true },
  });

  if (existing) {
    return;
  }

  await db.transaction(async (tx) => {
    const [routing] = await tx
      .insert(routings)
      .values({ itemId: rootItemId, createdBy })
      .returning({ id: routings.id });

    for (const [index, code] of operationCodes.entries()) {
      const operationId = operationIdByCode.get(code);

      if (!operationId) {
        throw new Error(`Routing references unknown operation code "${code}".`);
      }

      await tx.insert(routingOperations).values({
        routingId: routing.id,
        operationId,
        sortOrder: index,
        createdBy,
      });
    }
  });
}

export async function seedItems(db: SeedDatabase): Promise<void> {
  const admin = await db.query.credentials.findFirst({
    where: eq(credentials.username, 'admin'),
    columns: { userId: true },
  });

  if (!admin) {
    console.warn(
      'Credential "admin" not found — seeded items will have createdBy = null. Run `pnpm db:seed:credentials` first for a complete seed.',
    );
  }

  const createdBy = admin?.userId ?? null;

  // --- Materials (RM) ---

  const materialUnitCodes = [...new Set(MATERIALS.map((m) => m.unitCode))];
  const materialUnitRows = await db.query.units.findMany({
    where: inArray(units.code, materialUnitCodes),
    columns: { id: true, code: true },
  });
  const materialUnitIdByCode = new Map(
    materialUnitRows.map((u) => [u.code, u.id]),
  );

  const materialIdByCode = new Map<string, string>();
  for (const spec of MATERIALS) {
    const unitId = materialUnitIdByCode.get(spec.unitCode);

    if (!unitId) {
      console.warn(
        `Unit "${spec.unitCode}" not found — skipping "${spec.code}". Run \`pnpm db:seed:units\` first.`,
      );
      continue;
    }

    const existing = await db.query.items.findFirst({
      where: eq(items.code, spec.code),
      columns: { id: true },
    });

    if (existing) {
      console.log(`Item "${spec.code}" already exists. Skipping.`);
      materialIdByCode.set(spec.code, existing.id);
      continue;
    }

    const [material] = await db
      .insert(items)
      .values({
        code: spec.code,
        name: spec.name,
        type: ItemType.RM,
        unitId,
        materialGrade: spec.materialGrade,
        dimensions: spec.dimensions,
        specificWeight: spec.specificWeight,
        colorSurface: spec.colorSurface,
        origin: spec.origin,
        createdBy,
      })
      .returning({ id: items.id });

    console.log(`Item "${spec.code}" (${spec.name}) created.`);
    materialIdByCode.set(spec.code, material.id);
  }

  // --- FG/WIP structure ---

  const unit = await db.query.units.findFirst({
    where: eq(units.code, 'CAI'),
    columns: { id: true },
  });

  if (!unit) {
    throw new Error('Unit "CAI" not found — run `pnpm db:seed:units` first.');
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
  for (const spec of WIP_ITEMS) {
    const item = await ensureItem(db, {
      ...spec,
      type: ItemType.WIP,
      unitId: unit.id,
      createdBy,
    });
    wipIdByCode.set(spec.code, item.id);

    await ensureRootOperations(
      db,
      item.id,
      WIP_ROUTING[spec.code] ?? [],
      operationIdByCode,
      createdBy,
    );
  }

  for (const spec of FG_ITEMS) {
    const item = await ensureItem(db, {
      ...spec,
      type: ItemType.FG,
      unitId: unit.id,
      createdBy,
    });

    await ensureBomTree(
      db,
      spec.code,
      item.id,
      wipIdByCode,
      operationIdByCode,
      materialIdByCode,
      createdBy,
    );

    await ensureRootOperations(
      db,
      item.id,
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
    await seedItems(db);
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
      console.error('Failed to seed items:', error);
      process.exit(1);
    });
}
