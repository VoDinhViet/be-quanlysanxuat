import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { reset } from 'drizzle-seed';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { seedRbac } from './rbac.seed';

const RESET_CONFIRMATION = 'YES';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (process.env.RESET_DATA_CONFIRM !== RESET_CONFIRMATION) {
    throw new Error('Set RESET_DATA_CONFIRM=YES to reset database data');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await client`BEGIN`;
    await reset(db, schema);
    await seedRbac(db);
    await client`COMMIT`;
  } catch (error) {
    await client`ROLLBACK`;
    throw error;
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    console.log('Database data reset successfully');
  })
  .catch((error) => {
    console.error('Failed to reset database data');
    console.error(error);
    process.exit(1);
  });
