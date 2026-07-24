import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { supplierGroups } from '../schemas/supplier-groups';

const SUPPLIER_GROUPS = [
  {
    code: 'VTKL',
    name: 'Vật tư kim loại',
    description: 'Thép tấm, ống, hộp, kim loại các loại',
  },
  {
    code: 'LKCK',
    name: 'Linh kiện cơ khí',
    description: 'Bạc đạn, vòng bi, linh kiện cơ khí',
  },
  {
    code: 'GC',
    name: 'Gia công',
    description: 'Gia công cơ khí, chi tiết máy',
  },
  {
    code: 'TBD',
    name: 'Thiết bị điện',
    description: 'Thiết bị, linh kiện điện',
  },
  {
    code: 'NVL',
    name: 'Nguyên vật liệu',
    description: 'Cao su, nhựa kỹ thuật, nguyên vật liệu khác',
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedSupplierGroups(db);
  } finally {
    await client.end();
  }
}

async function seedSupplierGroups(
  db: ReturnType<typeof drizzle<typeof schema>>,
) {
  for (const group of SUPPLIER_GROUPS) {
    const existing = await db.query.supplierGroups.findFirst({
      where: eq(supplierGroups.code, group.code),
    });

    if (existing) {
      console.log(`Supplier group "${group.code}" already exists. Skipping.`);
      continue;
    }

    await db.insert(supplierGroups).values(group);
    console.log(`Supplier group "${group.code}" (${group.name}) created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed supplier groups:', error);
      process.exit(1);
    });
}
