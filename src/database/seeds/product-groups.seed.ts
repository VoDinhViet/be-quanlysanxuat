import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { productGroups } from '../schemas/product-groups';

/**
 * Product groups classify a product by its nature/origin, not by product family.
 *
 * Note `VAT_TU` is a *product* group and is unrelated to the `material_groups` table used by the
 * materials module — same word, different table, different purpose.
 */
const PRODUCT_GROUPS = [
  {
    code: 'THANH_PHAM',
    name: 'Sản phẩm thành phẩm',
    description: 'Sản phẩm hoàn chỉnh do nhà máy sản xuất',
  },
  {
    code: 'LINH_KIEN',
    name: 'Linh kiện',
    description: 'Linh kiện, cụm chi tiết',
  },
  { code: 'VAT_TU', name: 'Vật tư', description: 'Vật tư dùng trong sản xuất' },
  {
    code: 'MUA_NGOAI',
    name: 'Mua ngoài',
    description: 'Hàng mua ngoài, không tự sản xuất',
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
    await seedProductGroups(db);
  } finally {
    await client.end();
  }
}

async function seedProductGroups(
  db: ReturnType<typeof drizzle<typeof schema>>,
) {
  for (const group of PRODUCT_GROUPS) {
    const existing = await db.query.productGroups.findFirst({
      where: eq(productGroups.code, group.code),
    });

    if (existing) {
      console.log(`Product group "${group.code}" already exists. Skipping.`);
      continue;
    }

    await db.insert(productGroups).values(group);
    console.log(`Product group "${group.code}" (${group.name}) created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed product groups:', error);
      process.exit(1);
    });
}
