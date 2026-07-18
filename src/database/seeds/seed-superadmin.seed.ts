import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { hash } from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { credentials } from '../schemas/credentials';
import { ensureSuperAdminRole } from './seed-roles.seed';

const PASSWORD_SALT_ROUNDS = 10;

function getSuperadminConfig() {
  return {
    username: process.env.SUPERADMIN_USERNAME || 'superadmin',
    email: process.env.SUPERADMIN_EMAIL || 'superadmin@tienhuy.com',
    password: process.env.SUPERADMIN_PASSWORD || 'Admin@123',
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedSuperadmin(db);
  } finally {
    await client.end();
  }
}

async function seedSuperadmin(db: ReturnType<typeof drizzle<typeof schema>>) {
  const config = getSuperadminConfig();

  // The superadmin's power comes from the Super Admin role (which holds `system:manage`), so the
  // role must exist and the credential must point at it.
  const superAdminRoleId = await ensureSuperAdminRole(db);

  const existingUser = await db.query.credentials.findFirst({
    where: or(eq(credentials.username, config.username), eq(credentials.email, config.email)),
  });

  if (existingUser) {
    if (existingUser.roleId !== superAdminRoleId) {
      await db
        .update(credentials)
        .set({ roleId: superAdminRoleId })
        .where(eq(credentials.id, existingUser.id));
      console.log(`Superadmin already exists — linked it to the Super Admin role.`);
    } else {
      console.log(
        `Superadmin already exists (username: ${existingUser.username}, email: ${existingUser.email}). Skipping.`,
      );
    }
    return;
  }

  const password = await hash(config.password, PASSWORD_SALT_ROUNDS);

  await db.insert(credentials).values({
    username: config.username,
    email: config.email,
    password,
    roleId: superAdminRoleId,
  });

  console.log('Superadmin account created:');
  console.log(`  username: ${config.username}`);
  console.log(`  email: ${config.email}`);
  console.log(`  password: ${config.password}`);
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed superadmin:', error);
      process.exit(1);
    });
}
