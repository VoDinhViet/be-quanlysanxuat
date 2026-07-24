import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { units, unitScopes, UnitScope } from '../schemas/units';

const { PRODUCT, MATERIAL, SEMI_FINISHED } = UnitScope;

/**
 * `scopes` says which kinds of entity may be measured in each unit — raw-stock units (Tấm, Cây,
 * Mét) are material-only, while piece/weight units apply everywhere.
 *
 * Idempotent by `code`, and it **skips units that already exist**, so re-running will not add or
 * remove scopes on a unit already in the DB. Changing scopes later is a migration (or a future
 * admin screen), not a re-seed.
 */
const UNITS = [
  { code: 'TAM', name: 'Tấm', scopes: [MATERIAL] },
  { code: 'CAY', name: 'Cây', scopes: [MATERIAL] },
  { code: 'MET', name: 'Mét', scopes: [MATERIAL] },
  { code: 'CAI', name: 'Cái', scopes: [PRODUCT, MATERIAL, SEMI_FINISHED] },
  { code: 'BO', name: 'Bộ', scopes: [PRODUCT, MATERIAL, SEMI_FINISHED] },
  { code: 'KG', name: 'Kg', scopes: [PRODUCT, MATERIAL, SEMI_FINISHED] },
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
  for (const { code, name, scopes } of UNITS) {
    const existing = await db.query.units.findFirst({
      where: eq(units.code, code),
    });

    if (existing) {
      console.log(`Unit "${code}" already exists. Skipping.`);
      continue;
    }

    // The unit row and its scope rows must land together — a unit with no scope is unusable
    // everywhere, which is worse than not having created it at all.
    await db.transaction(async (tx) => {
      const [unit] = await tx.insert(units).values({ code, name }).returning();
      await tx
        .insert(unitScopes)
        .values(scopes.map((scope) => ({ unitId: unit.id, scope })));
    });

    console.log(
      `Unit "${code}" (${name}) created with scopes: ${scopes.join(', ')}.`,
    );
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
