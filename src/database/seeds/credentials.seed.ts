import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { hash } from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { type PermissionCode, SUPER_PERMISSION } from '../../constants/permission.constant';
import * as schema from '../schemas';
import { credentials } from '../schemas/credentials';
import { departments } from '../schemas/departments';
import { positions } from '../schemas/positions';
import { roles } from '../schemas/roles';
import { users } from '../schemas/users';

const PASSWORD_SALT_ROUNDS = 10;

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

interface RoleSeed {
  code: string;
  name: string;
  permissions: PermissionCode[];
  isSystem: boolean;
}

interface AccountSeed {
  username: string;
  email: string;
  role: RoleSeed;
  department: { code: string; name: string };
  position: { code: string; name: string };
  userCode: string;
  fullName: string;
}

const ROLES = {
  ADMIN: {
    code: 'ADMIN',
    name: 'Quản trị hệ thống',
    permissions: [SUPER_PERMISSION],
    isSystem: true,
  },
  DIRECTOR: {
    code: 'DIRECTOR',
    name: 'Giám đốc',
    permissions: [
      'roles:read',
      'users:create',
      'users:update',
      'clients:read',
      'products:read',
      'materials:read',
      'suppliers:read',
    ],
    isSystem: false,
  },
  SALES: {
    code: 'SALES',
    name: 'Kinh doanh',
    permissions: [
      'clients:read',
      'clients:create',
      'clients:update',
      'clients:delete',
      'products:read',
    ],
    isSystem: false,
  },
  PURCHASING: {
    code: 'PURCHASING',
    name: 'Mua hàng',
    permissions: [
      'suppliers:read',
      'suppliers:create',
      'suppliers:update',
      'suppliers:delete',
      'materials:read',
      'products:read',
    ],
    isSystem: false,
  },
  WAREHOUSE: {
    code: 'WAREHOUSE',
    name: 'Kho',
    permissions: ['materials:read', 'materials:create'],
    isSystem: false,
  },
  PRODUCTION: {
    code: 'PRODUCTION',
    name: 'Sản xuất',
    permissions: [
      'products:read',
      'products:create',
      'products:update',
      'products:delete',
      'products:copy',
      'materials:read',
    ],
    isSystem: false,
  },
  QC: {
    code: 'QC',
    name: 'Kiểm tra chất lượng (QC)',
    permissions: ['products:read', 'materials:read'],
    isSystem: false,
  },
} as const satisfies Record<string, RoleSeed>;

const ACCOUNTS: AccountSeed[] = [
  {
    username: 'admin',
    email: 'admin@tienhuy.com',
    role: ROLES.ADMIN,
    department: { code: 'IT', name: 'Phòng CNTT' },
    position: { code: 'ADMIN', name: 'Quản trị viên' },
    userCode: 'NV-ADMIN',
    fullName: 'Quản trị hệ thống',
  },
  {
    username: 'giamdoc',
    email: 'giamdoc@tienhuy.com',
    role: ROLES.DIRECTOR,
    department: { code: 'BGD', name: 'Ban Giám đốc' },
    position: { code: 'DIRECTOR', name: 'Giám đốc' },
    userCode: 'NV-GD',
    fullName: 'Giám đốc',
  },
  {
    username: 'kinhdoanh',
    email: 'kinhdoanh@tienhuy.com',
    role: ROLES.SALES,
    department: { code: 'KD', name: 'Phòng Kinh doanh' },
    position: { code: 'STAFF-KD', name: 'NV Kinh doanh' },
    userCode: 'NV-KD',
    fullName: 'Nhân viên Kinh doanh',
  },
  {
    username: 'muahang',
    email: 'muahang@tienhuy.com',
    role: ROLES.PURCHASING,
    department: { code: 'MH', name: 'Phòng Mua hàng' },
    position: { code: 'STAFF-MH', name: 'NV Mua hàng' },
    userCode: 'NV-MH',
    fullName: 'Nhân viên Mua hàng',
  },
  {
    username: 'kho',
    email: 'kho@tienhuy.com',
    role: ROLES.WAREHOUSE,
    department: { code: 'KHO', name: 'Phòng Kho' },
    position: { code: 'STAFF-KHO', name: 'NV Kho' },
    userCode: 'NV-KHO',
    fullName: 'Nhân viên Kho',
  },
  {
    username: 'sanxuat',
    email: 'sanxuat@tienhuy.com',
    role: ROLES.PRODUCTION,
    department: { code: 'SX', name: 'Phòng Sản xuất' },
    position: { code: 'STAFF-SX', name: 'NV Sản xuất' },
    userCode: 'NV-SX',
    fullName: 'Nhân viên Sản xuất',
  },
  {
    username: 'qc',
    email: 'qc@tienhuy.com',
    role: ROLES.QC,
    department: { code: 'QC', name: 'Phòng QC' },
    position: { code: 'STAFF-QC', name: 'NV QC' },
    userCode: 'NV-QC',
    fullName: 'Nhân viên QC',
  },
];

function getSeedPassword(): string {
  return process.env.SEED_PASSWORD || '123456';
}

async function ensureRole(db: SeedDatabase, role: RoleSeed): Promise<string> {
  const existing = await db.query.roles.findFirst({
    where: eq(roles.code, role.code),
    columns: { id: true },
  });

  if (existing) {
    console.log(`Role "${role.code}" already exists. Skipping.`);
    return existing.id;
  }

  const [created] = await db
    .insert(roles)
    .values({
      code: role.code,
      name: role.name,
      permissions: role.permissions,
      isSystem: role.isSystem,
    })
    .returning({ id: roles.id });

  console.log(`Role "${role.code}" created.`);

  return created.id;
}

async function ensureDepartment(
  db: SeedDatabase,
  department: { code: string; name: string },
): Promise<string> {
  const existing = await db.query.departments.findFirst({
    where: eq(departments.code, department.code),
    columns: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(departments)
    .values(department)
    .returning({ id: departments.id });

  console.log(`Department "${department.code}" (${department.name}) created.`);

  return created.id;
}

async function ensurePosition(
  db: SeedDatabase,
  position: { code: string; name: string },
): Promise<string> {
  const existing = await db.query.positions.findFirst({
    where: eq(positions.code, position.code),
    columns: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const [created] = await db.insert(positions).values(position).returning({ id: positions.id });

  console.log(`Position "${position.code}" (${position.name}) created.`);

  return created.id;
}

async function ensureCredential(
  db: SeedDatabase,
  account: { username: string; email: string },
  roleId: string,
  password: string,
): Promise<string> {
  const existing = await db.query.credentials.findFirst({
    where: or(eq(credentials.username, account.username), eq(credentials.email, account.email)),
  });

  if (existing) {
    if (existing.roleId !== roleId) {
      await db.update(credentials).set({ roleId }).where(eq(credentials.id, existing.id));
      console.log(`Credential "${account.username}" already exists — relinked to role.`);
    } else {
      console.log(`Credential "${account.username}" already exists. Skipping.`);
    }

    return existing.id;
  }

  const hashedPassword = await hash(password, PASSWORD_SALT_ROUNDS);

  const [created] = await db
    .insert(credentials)
    .values({
      username: account.username,
      email: account.email,
      password: hashedPassword,
      roleId,
    })
    .returning({ id: credentials.id });

  console.log(`Credential "${account.username}" created.`);

  return created.id;
}

async function ensureUser(
  db: SeedDatabase,
  account: {
    userCode: string;
    fullName: string;
    departmentId: string;
    positionId: string;
    credentialId: string;
  },
): Promise<void> {
  const existing = await db.query.users.findFirst({
    where: eq(users.code, account.userCode),
    columns: { id: true },
  });

  if (existing) {
    console.log(`User "${account.userCode}" already exists. Skipping.`);
    return;
  }

  await db.insert(users).values({
    code: account.userCode,
    fullName: account.fullName,
    departmentId: account.departmentId,
    positionId: account.positionId,
    hireDate: new Date(),
    credentialId: account.credentialId,
  });

  console.log(`User "${account.userCode}" (${account.fullName}) created.`);
}

export async function seedCredentials(db: SeedDatabase): Promise<void> {
  const password = getSeedPassword();

  for (const account of ACCOUNTS) {
    const roleId = await ensureRole(db, account.role);
    const departmentId = await ensureDepartment(db, account.department);
    const positionId = await ensurePosition(db, account.position);
    const credentialId = await ensureCredential(db, account, roleId, password);

    await ensureUser(db, {
      userCode: account.userCode,
      fullName: account.fullName,
      departmentId,
      positionId,
      credentialId,
    });
  }

  console.log('\nSeeded accounts (username / password):');
  for (const account of ACCOUNTS) {
    console.log(`  ${account.username} / ${password}`);
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
    await seedCredentials(db);
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
      console.error('Failed to seed credentials:', error);
      process.exit(1);
    });
}
