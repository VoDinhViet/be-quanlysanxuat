import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { operations, OperationType } from '../schemas/operations';

/**
 * Curated công đoạn (production operations) master data — the steps a product/part's routing
 * (Phase 2) is built from. `type` marks whether the step normally runs on the factory floor
 * (`INHOUSE`) or is sent to a supplier (`OUTSOURCE`) — adjust per real shop-floor process.
 */
const OPERATIONS = [
  { code: 'CAT_LASER', name: 'Cắt laser', type: OperationType.INHOUSE },
  { code: 'CHAN', name: 'Chấn', type: OperationType.INHOUSE },
  { code: 'HAN', name: 'Hàn', type: OperationType.INHOUSE },
  { code: 'MAI', name: 'Mài', type: OperationType.INHOUSE },
  { code: 'LAP_RAP_TONG', name: 'Lắp ráp tổng', type: OperationType.INHOUSE },
  { code: 'DONG_GOI', name: 'Đóng gói', type: OperationType.INHOUSE },
  { code: 'SON_TINH_DIEN', name: 'Sơn tĩnh điện', type: OperationType.OUTSOURCE },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedOperations(db);
  } finally {
    await client.end();
  }
}

async function seedOperations(db: ReturnType<typeof drizzle<typeof schema>>) {
  for (const operation of OPERATIONS) {
    const existing = await db.query.operations.findFirst({
      where: eq(operations.code, operation.code),
    });

    if (existing) {
      console.log(`Operation "${operation.code}" already exists. Skipping.`);
      continue;
    }

    await db.insert(operations).values(operation);
    console.log(`Operation "${operation.code}" (${operation.name}) created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed operations:', error);
      process.exit(1);
    });
}
