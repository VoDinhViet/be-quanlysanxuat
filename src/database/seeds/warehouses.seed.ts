import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { warehouses, WarehouseType } from '../schemas/inventory/warehouses';

const WAREHOUSES = [
  {
    code: 'KHO-NVL',
    name: 'Kho nguyên vật liệu',
    type: WarehouseType.RM,
  },
  { code: 'KHO-BTP', name: 'Kho bán thành phẩm', type: WarehouseType.WIP },
  {
    code: 'KHO-TP',
    name: 'Kho thành phẩm',
    type: WarehouseType.FG,
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
    await seedWarehouses(db);
  } finally {
    await client.end();
  }
}

async function seedWarehouses(db: ReturnType<typeof drizzle<typeof schema>>) {
  for (const { code, name, type } of WAREHOUSES) {
    const existing = await db.query.warehouses.findFirst({
      where: eq(warehouses.code, code),
    });

    if (existing) {
      console.log(`Warehouse "${code}" already exists. Skipping.`);
      continue;
    }

    await db.insert(warehouses).values({ code, name, type });

    console.log(`Warehouse "${code}" (${name}) created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed warehouses:', error);
      process.exit(1);
    });
}
