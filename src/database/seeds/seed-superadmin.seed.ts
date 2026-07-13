import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { hash } from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { UserStatus, users } from '../schemas/users';

const PASSWORD_SALT_ROUNDS = 10;

function getSuperadminConfig() {
  return {
    code: process.env.SUPERADMIN_CODE || 'ADMIN001',
    username: process.env.SUPERADMIN_USERNAME || 'superadmin',
    email: process.env.SUPERADMIN_EMAIL || 'superadmin@tienhuy.com',
    password: process.env.SUPERADMIN_PASSWORD || 'Admin@123',
    fullName: process.env.SUPERADMIN_FULL_NAME || 'Super Admin',
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

  const existingUser = await db.query.users.findFirst({
    where: or(
      eq(users.username, config.username),
      eq(users.email, config.email),
      eq(users.code, config.code),
    ),
  });

  if (existingUser) {
    console.log(
      `Superadmin already exists (username: ${existingUser.username}, email: ${existingUser.email}). Skipping.`,
    );
    return;
  }

  const password = await hash(config.password, PASSWORD_SALT_ROUNDS);

  await db.insert(users).values({
    code: config.code,
    username: config.username,
    email: config.email,
    password,
    fullName: config.fullName,
    status: UserStatus.ACTIVE,
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
