import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { credentials } from '../schemas/identity-access/credentials';
import { materialGroups } from '../schemas/materials/material-groups';
import {
  MaterialStatus,
  MaterialType,
  materials,
} from '../schemas/materials/materials';
import { units } from '../schemas/units/units';

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

interface MaterialSeed {
  code: string;
  name: string;
  groupCode: string;
  unitCode: string;
  materialGrade?: string;
  dimensions?: string;
  specificWeight?: number;
  colorSurface?: string;
  origin?: string;
}

/**
 * Curated, spread across every group in `material-groups.seed.ts` so `GET /materials` has
 * something real to filter/search on right after the reference-data seeds run. All `type:
 * INTERNAL` — a demo `CLIENT`-type row would need a stable client id, but `clients.seed.ts`
 * generates random fake rows via `drizzle-seed` with no fixed code to look up (see
 * `.claude/rules/database.md`).
 */
const MATERIALS: MaterialSeed[] = [
  {
    code: 'THEP-TAM-5',
    name: 'Thép tấm 5mm',
    groupCode: 'THEP_TAM',
    unitCode: 'TAM',
    dimensions: '1000x2000x5mm',
    specificWeight: 7.85,
    materialGrade: 'SS400',
    origin: 'Việt Nam',
  },
  {
    code: 'THEP-TAM-10',
    name: 'Thép tấm 10mm',
    groupCode: 'THEP_TAM',
    unitCode: 'TAM',
    dimensions: '1000x2000x10mm',
    specificWeight: 7.85,
    materialGrade: 'SS400',
  },
  {
    code: 'THEP-CUON-2',
    name: 'Thép cuộn 2mm',
    groupCode: 'THEP_CUON',
    unitCode: 'KG',
    specificWeight: 7.85,
    materialGrade: 'SPCC',
  },
  {
    code: 'ONG-INOX-D21',
    name: 'Ống inox Ø21',
    groupCode: 'ONG_INOX',
    unitCode: 'CAY',
    dimensions: 'Ø21x1.2mm',
    materialGrade: 'SUS304',
  },
  {
    code: 'ONG-INOX-D27',
    name: 'Ống inox Ø27',
    groupCode: 'ONG_INOX',
    unitCode: 'CAY',
    dimensions: 'Ø27x1.2mm',
    materialGrade: 'SUS304',
  },
  {
    code: 'NHOM-TAM-3',
    name: 'Nhôm tấm 3mm',
    groupCode: 'NHOM_TAM',
    unitCode: 'TAM',
    specificWeight: 2.7,
    materialGrade: 'A5052',
  },
  {
    code: 'BULONG-M8',
    name: 'Bu lông M8x20',
    groupCode: 'BU_LONG',
    unitCode: 'CAI',
    dimensions: 'M8x20mm',
  },
  {
    code: 'BULONG-M10',
    name: 'Bu lông M10x25',
    groupCode: 'BU_LONG',
    unitCode: 'CAI',
    dimensions: 'M10x25mm',
  },
  {
    code: 'SON-DEN',
    name: 'Sơn tĩnh điện màu đen',
    groupCode: 'SON',
    unitCode: 'KG',
    colorSurface: 'Đen (RAL9005)',
  },
  {
    code: 'SON-TRANG',
    name: 'Sơn tĩnh điện màu trắng',
    groupCode: 'SON',
    unitCode: 'KG',
    colorSurface: 'Trắng (RAL9003)',
  },
];

export async function seedMaterials(db: SeedDatabase): Promise<void> {
  const groupCodes = [...new Set(MATERIALS.map((m) => m.groupCode))];
  const groups = await db.query.materialGroups.findMany({
    where: inArray(materialGroups.code, groupCodes),
    columns: { id: true, code: true },
  });
  const groupIdByCode = new Map(groups.map((g) => [g.code, g.id]));

  const unitCodes = [...new Set(MATERIALS.map((m) => m.unitCode))];
  const unitRows = await db.query.units.findMany({
    where: inArray(units.code, unitCodes),
    columns: { id: true, code: true },
  });
  const unitIdByCode = new Map(unitRows.map((u) => [u.code, u.id]));

  const admin = await db.query.credentials.findFirst({
    where: eq(credentials.username, 'admin'),
    columns: { userId: true },
  });

  if (!admin) {
    console.warn(
      'Credential "admin" not found — seeded materials will have createdBy = null. Run `pnpm db:seed:credentials` first for a complete seed.',
    );
  }

  const createdBy = admin?.userId ?? null;

  for (const spec of MATERIALS) {
    const existing = await db.query.materials.findFirst({
      where: eq(materials.code, spec.code),
      columns: { id: true },
    });

    if (existing) {
      console.log(`Material "${spec.code}" already exists. Skipping.`);
      continue;
    }

    // `unitId`/`materialGroupId` are NOT NULL on `materials` — unlike `createdBy`, a missing
    // reference here can't be nulled out, so the row is skipped entirely instead.
    const materialGroupId = groupIdByCode.get(spec.groupCode);
    const unitId = unitIdByCode.get(spec.unitCode);

    if (!materialGroupId) {
      console.warn(
        `Material group "${spec.groupCode}" not found — skipping "${spec.code}". Run \`pnpm db:seed:material-groups\` first.`,
      );
      continue;
    }
    if (!unitId) {
      console.warn(
        `Unit "${spec.unitCode}" not found — skipping "${spec.code}". Run \`pnpm db:seed:units\` first.`,
      );
      continue;
    }

    await db.insert(materials).values({
      code: spec.code,
      name: spec.name,
      unitId,
      materialGroupId,
      type: MaterialType.INTERNAL,
      status: MaterialStatus.ACTIVE,
      materialGrade: spec.materialGrade,
      dimensions: spec.dimensions,
      specificWeight: spec.specificWeight,
      colorSurface: spec.colorSurface,
      origin: spec.origin,
      createdBy,
    });

    console.log(`Material "${spec.code}" (${spec.name}) created.`);
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
    await seedMaterials(db);
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
      console.error('Failed to seed materials:', error);
      process.exit(1);
    });
}
