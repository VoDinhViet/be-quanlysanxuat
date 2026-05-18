import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { hash } from 'bcryptjs';
import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { UserStatus, users } from '../schemas';
import { roles } from '../schemas/rbac/roles';
import { rbacRolesSeed, seedRbac } from './rbac';

const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || '123456';

const defaultUsers = [
  {
    roleCode: 'admin',
    email: 'admin@example.com',
    fullName: 'Admin',
  },
  {
    roleCode: 'director',
    email: 'director@example.com',
    fullName: 'Director',
  },
  {
    roleCode: 'qc',
    email: 'qc@example.com',
    fullName: 'QC',
  },
  {
    roleCode: 'sales',
    email: 'sales@example.com',
    fullName: 'Sales',
  },
  {
    roleCode: 'production_manager',
    email: 'production.manager@example.com',
    fullName: 'Production Manager',
  },
  {
    roleCode: 'procurement_manager',
    email: 'procurement.manager@example.com',
    fullName: 'Procurement Manager',
  },
  {
    roleCode: 'warehouse',
    email: 'warehouse@example.com',
    fullName: 'Warehouse',
  },
] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedRbac(db);
    await seedDefaultUsers(db);
  } finally {
    await client.end();
  }
}

async function seedDefaultUsers(db: ReturnType<typeof drizzle<typeof schema>>) {
  const roleRows = await db
    .select()
    .from(roles)
    .where(
      inArray(
        roles.code,
        rbacRolesSeed.map((role) => role.code),
      ),
    );

  const roleIdByCode = new Map(roleRows.map((role) => [role.code, role.id]));
  const password = await hash(DEFAULT_PASSWORD, 10);

  const rows = defaultUsers.map((user) => {
    const roleId = roleIdByCode.get(user.roleCode);

    if (!roleId) {
      throw new Error(`Role ${user.roleCode} not found`);
    }

    return {
      email: user.email,
      fullName: user.fullName,
      password,
      roleId,
      status: UserStatus.Active,
    };
  });

  await db
    .insert(users)
    .values(rows)
    .onConflictDoUpdate({
      target: users.email,
      set: {
        fullName: sql.raw(`excluded.${users.fullName.name}`),
        password: sql.raw(`excluded.${users.password.name}`),
        roleId: sql.raw(`excluded.${users.roleId.name}`),
        status: UserStatus.Active,
        updatedAt: new Date(),
      },
    });
}

main()
  .then(() => {
    console.log('Default users seeded successfully');
    console.log(`Default password: ${DEFAULT_PASSWORD}`);
  })
  .catch((error) => {
    console.error('Failed to seed default users');
    console.error(error);
    process.exit(1);
  });
