import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import {
  ACCOUNTS,
  ensureDepartment,
  ensurePosition,
  ensureRole,
  type SeedDatabase,
} from './credentials.seed';

export async function seedDepartmentsRolesAndPositions(
  db: SeedDatabase,
): Promise<void> {
  for (const account of ACCOUNTS) {
    await ensureRole(db, account.role);
    const departmentId = await ensureDepartment(db, account.department);
    await ensurePosition(db, account.position, departmentId);
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
    await seedDepartmentsRolesAndPositions(db);
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
      console.error('Failed to seed departments, roles and positions:', error);
      process.exit(1);
    });
}
