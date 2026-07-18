import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { units } from '../schemas/units';

const UNITS = [
  { code: 'TAM', name: 'Tấm' },
  { code: 'CAY', name: 'Cây' },
  { code: 'CAI', name: 'Cái' },
  { code: 'KG', name: 'Kg' },
  { code: 'BO', name: 'Bộ' },
  { code: 'MET', name: 'Mét' },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedUnits(db);
  } finally {
    await client.end();
  }
}

async function seedUnits(db: ReturnType<typeof drizzle<typeof schema>>) {
  for (const unit of UNITS) {
    const existing = await db.query.units.findFirst({ where: eq(units.code, unit.code) });

    if (existing) {
      console.log(`Unit "${unit.code}" already exists. Skipping.`);
      continue;
    }

    await db.insert(units).values(unit);
    console.log(`Unit "${unit.code}" (${unit.name}) created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed units:', error);
      process.exit(1);
    });
}
