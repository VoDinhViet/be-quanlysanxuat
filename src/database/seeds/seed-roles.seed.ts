import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { SUPER_PERMISSION } from '../../constants/permission.constant';
import * as schema from '../schemas';
import { roles } from '../schemas/roles';

export const SUPER_ADMIN_ROLE_CODE = 'SUPER_ADMIN';

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Ensures the Super Admin role exists (idempotent) and returns its id. Super Admin holds the
 * god-mode `system:manage` permission, so it passes every authorization check, and is flagged
 * `isSystem` so the roles API refuses to edit or delete it.
 */
export async function ensureSuperAdminRole(db: SeedDatabase): Promise<string> {
  const existing = await db.query.roles.findFirst({
    where: eq(roles.code, SUPER_ADMIN_ROLE_CODE),
    columns: { id: true },
  });

  if (existing) {
    console.log(`Role "${SUPER_ADMIN_ROLE_CODE}" already exists. Skipping.`);
    return existing.id;
  }

  const [created] = await db
    .insert(roles)
    .values({
      code: SUPER_ADMIN_ROLE_CODE,
      name: 'Super Admin',
      description: 'Full system access',
      permissions: [SUPER_PERMISSION],
      isSystem: true,
    })
    .returning({ id: roles.id });

  console.log(`Role "${SUPER_ADMIN_ROLE_CODE}" created.`);

  return created.id;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await ensureSuperAdminRole(db);
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
      console.error('Failed to seed roles:', error);
      process.exit(1);
    });
}
