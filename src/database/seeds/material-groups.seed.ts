import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { materialGroups } from '../schemas/material-groups';

const MATERIAL_GROUPS = [
  { code: 'THEP_TAM', name: 'Thép tấm', description: 'Thép dạng tấm' },
  { code: 'THEP_CUON', name: 'Thép cuộn', description: 'Thép dạng cuộn' },
  { code: 'ONG_INOX', name: 'Ống inox', description: 'Ống thép không gỉ' },
  { code: 'NHOM_TAM', name: 'Nhôm tấm', description: 'Nhôm dạng tấm' },
  { code: 'BU_LONG', name: 'Bu lông', description: 'Bu lông, ốc vít' },
  { code: 'SON', name: 'Sơn', description: 'Sơn các loại' },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedMaterialGroups(db);
  } finally {
    await client.end();
  }
}

async function seedMaterialGroups(
  db: ReturnType<typeof drizzle<typeof schema>>,
) {
  for (const group of MATERIAL_GROUPS) {
    const existing = await db.query.materialGroups.findFirst({
      where: eq(materialGroups.code, group.code),
    });

    if (existing) {
      console.log(`Material group "${group.code}" already exists. Skipping.`);
      continue;
    }

    await db.insert(materialGroups).values(group);
    console.log(`Material group "${group.code}" (${group.name}) created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed material groups:', error);
      process.exit(1);
    });
}
