import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { hash } from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  type PermissionCode,
  SUPER_PERMISSION,
} from '../../constants/permission.constant';
import * as schema from '../schemas';
import { credentials } from '../schemas/identity-access/credentials';
import { departments } from '../schemas/departments';
import { positions } from '../schemas/positions';
import { roles } from '../schemas/identity-access/roles';
import { users } from '../schemas/identity-access/users';

const PASSWORD_SALT_ROUNDS = 10;

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

interface RoleSeed {
  code: string;
  name: string;
  permissions: PermissionCode[];
  isSystem: boolean;
  isProtected: boolean;
}

interface AccountSeed {
  username: string;
  email: string;
  role: RoleSeed;
  department: { code: string; name: string };
  position: { code: string; name: string };
  userCode: string;
  fullName: string;
  isProtected: boolean;
}

const ROLES = {
  ADMIN: {
    code: 'ADMIN',
    name: 'Quản trị hệ thống',
    permissions: [SUPER_PERMISSION],
    isSystem: true,
    isProtected: true,
  },
  DIRECTOR: {
    code: 'DIRECTOR',
    name: 'Giám đốc',
    permissions: [
      'roles:read',
      'roles:update',
      'users:create',
      'users:update',
      'clients:read',
      'items:read',
      'suppliers:read',
      'orders:read',
      'orders:approve',
      'purchase-requests:read',
      'purchase-requests:approve',
      'inventory:read',
      'inventory-requisitions:read',
      'inventory-requisitions:approve',
      'production:read',
      'production:approve',
      'purchasing:read',
      'purchasing:approve',
      'iqc:read',
      'outsourcing:read',
      'oqc:read',
      'qc-aql:read',
      'outbound:read',
      'outbound:approve',
      'reports:read',
    ],
    isSystem: false,
    isProtected: false,
  },
  SALES: {
    code: 'SALES',
    name: 'Kinh doanh',
    permissions: [
      'clients:read',
      'clients:create',
      'clients:update',
      'clients:delete',
      'items:read',
      'orders:read',
      'orders:create',
      'orders:update',
      'production:read',
      'outbound:read',
      'outbound:create',
      'outbound:update',
      'reports:read',
    ],
    isSystem: false,
    isProtected: false,
  },
  PURCHASING: {
    code: 'PURCHASING',
    name: 'Mua hàng',
    permissions: [
      'suppliers:read',
      'suppliers:create',
      'suppliers:update',
      'suppliers:delete',
      'items:read',
      'purchase-requests:read',
      'purchase-requests:create',
      'purchase-requests:update',
      'purchase-requests:delete',
      'purchasing:read',
      'purchasing:create',
      'purchasing:update',
      'purchasing:delete',
      'inventory-requisitions:read',
      'reports:read',
    ],
    isSystem: false,
    isProtected: false,
  },
  WAREHOUSE: {
    code: 'WAREHOUSE',
    name: 'Kho',
    permissions: [
      'items:read',
      'items:create',
      'items:update',
      'purchase-requests:read',
      'inventory:read',
      'inventory:create',
      'inventory:update',
      'inventory:delete',
      'inventory-requisitions:read',
      'inventory-requisitions:issue',
      'purchasing:read',
      'iqc:read',
      'outsourcing:read',
      'outsourcing:create',
      'outsourcing:update',
      'outsourcing:delete',
      'oqc:read',
      'outbound:read',
      'outbound:update',
      'reports:read',
    ],
    isSystem: false,
    isProtected: false,
  },
  PRODUCTION: {
    code: 'PRODUCTION',
    name: 'Sản xuất',
    permissions: [
      'items:read',
      'items:create',
      'items:update',
      'items:copy',
      'items:bom-manage',
      'operations:read',
      'operations:create',
      'operations:update',
      'operations:delete',
      'production:read',
      'production:update',
      'production:approve',
      'purchase-requests:read',
      'inventory:read',
      'inventory-requisitions:read',
      'inventory-requisitions:create',
      'inventory-requisitions:update',
      'inventory-requisitions:delete',
      'outsourcing:read',
      'outsourcing:create',
      'outsourcing:update',
      'outsourcing:delete',
      'oqc:read',
      'oqc:create',
      'oqc:delete',
      'reports:read',
    ],
    isSystem: false,
    isProtected: false,
  },
  QC: {
    code: 'QC',
    name: 'Kiểm tra chất lượng (QC)',
    permissions: [
      'items:read',
      'iqc:read',
      'iqc:create',
      'iqc:update',
      'iqc:delete',
      'outsourcing:read',
      'oqc:read',
      'oqc:update',
      'qc-aql:read',
      'qc-aql:create',
      'qc-aql:update',
      'reports:read',
    ],
    isSystem: false,
    isProtected: false,
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
    isProtected: true,
  },
  {
    username: 'giamdoc',
    email: 'giamdoc@tienhuy.com',
    role: ROLES.DIRECTOR,
    department: { code: 'BGD', name: 'Ban Giám đốc' },
    position: { code: 'DIRECTOR', name: 'Giám đốc' },
    userCode: 'NV-GD',
    fullName: 'Giám đốc',
    isProtected: false,
  },
  {
    username: 'kinhdoanh',
    email: 'kinhdoanh@tienhuy.com',
    role: ROLES.SALES,
    department: { code: 'KD', name: 'Phòng Kinh doanh' },
    position: { code: 'STAFF-KD', name: 'NV Kinh doanh' },
    userCode: 'NV-KD',
    fullName: 'Nhân viên Kinh doanh',
    isProtected: false,
  },
  {
    username: 'muahang',
    email: 'muahang@tienhuy.com',
    role: ROLES.PURCHASING,
    department: { code: 'MH', name: 'Phòng Mua hàng' },
    position: { code: 'STAFF-MH', name: 'NV Mua hàng' },
    userCode: 'NV-MH',
    fullName: 'Nhân viên Mua hàng',
    isProtected: false,
  },
  {
    username: 'kho',
    email: 'kho@tienhuy.com',
    role: ROLES.WAREHOUSE,
    department: { code: 'KHO', name: 'Phòng Kho' },
    position: { code: 'STAFF-KHO', name: 'NV Kho' },
    userCode: 'NV-KHO',
    fullName: 'Nhân viên Kho',
    isProtected: false,
  },
  {
    username: 'sanxuat',
    email: 'sanxuat@tienhuy.com',
    role: ROLES.PRODUCTION,
    department: { code: 'SX', name: 'Phòng Sản xuất' },
    position: { code: 'STAFF-SX', name: 'NV Sản xuất' },
    userCode: 'NV-SX',
    fullName: 'Nhân viên Sản xuất',
    isProtected: false,
  },
  {
    username: 'qc',
    email: 'qc@tienhuy.com',
    role: ROLES.QC,
    department: { code: 'QC', name: 'Phòng QC' },
    position: { code: 'STAFF-QC', name: 'NV QC' },
    userCode: 'NV-QC',
    fullName: 'Nhân viên QC',
    isProtected: false,
  },
];

function getSeedPassword(): string {
  return process.env.SEED_PASSWORD || '123456';
}

async function ensureRole(db: SeedDatabase, role: RoleSeed): Promise<string> {
  const existing = await db.query.roles.findFirst({
    where: eq(roles.code, role.code),
    columns: { id: true, permissions: true },
  });

  if (existing) {
    const missing = role.permissions.filter(
      (permission) => !existing.permissions.includes(permission),
    );

    if (missing.length > 0) {
      await db
        .update(roles)
        .set({ permissions: [...existing.permissions, ...missing] })
        .where(eq(roles.id, existing.id));
      console.log(
        `Role "${role.code}" already exists — added missing permissions: ${missing.join(', ')}.`,
      );
    } else {
      console.log(`Role "${role.code}" already exists. Skipping.`);
    }

    return existing.id;
  }

  const [created] = await db
    .insert(roles)
    .values({
      code: role.code,
      name: role.name,
      permissions: role.permissions,
      isSystem: role.isSystem,
      isProtected: role.isProtected,
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
  departmentId: string,
): Promise<string> {
  const existing = await db.query.positions.findFirst({
    where: eq(positions.code, position.code),
    columns: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(positions)
    .values({ ...position, departmentId })
    .returning({ id: positions.id });

  console.log(`Position "${position.code}" (${position.name}) created.`);

  return created.id;
}

/** `users` trước, `credentials` sau — `credentials.userId` NOT NULL nên credential luôn cần một
 * user có sẵn để trỏ vào (ngược thứ tự cũ, khi `users.credentialId` còn nullable). */
async function ensureUser(
  db: SeedDatabase,
  account: {
    userCode: string;
    fullName: string;
    departmentId: string;
    positionId: string;
  },
): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(users.code, account.userCode),
    columns: { id: true },
  });

  if (existing) {
    console.log(`User "${account.userCode}" already exists. Skipping.`);
    return existing.id;
  }

  const [created] = await db
    .insert(users)
    .values({
      code: account.userCode,
      fullName: account.fullName,
      departmentId: account.departmentId,
      positionId: account.positionId,
      hireDate: new Date(),
    })
    .returning({ id: users.id });

  console.log(`User "${account.userCode}" (${account.fullName}) created.`);

  return created.id;
}

async function ensureCredential(
  db: SeedDatabase,
  account: { username: string; email: string; isProtected: boolean },
  roleId: string,
  userId: string,
  password: string,
): Promise<void> {
  const existing = await db.query.credentials.findFirst({
    where: or(
      eq(credentials.username, account.username),
      eq(credentials.email, account.email),
    ),
  });

  if (existing) {
    if (existing.roleId !== roleId) {
      await db
        .update(credentials)
        .set({ roleId })
        .where(eq(credentials.id, existing.id));
      console.log(
        `Credential "${account.username}" already exists — relinked to role.`,
      );
    } else {
      console.log(`Credential "${account.username}" already exists. Skipping.`);
    }

    return;
  }

  const hashedPassword = await hash(password, PASSWORD_SALT_ROUNDS);

  await db.insert(credentials).values({
    username: account.username,
    email: account.email,
    password: hashedPassword,
    roleId,
    userId,
    isProtected: account.isProtected,
  });

  console.log(`Credential "${account.username}" created.`);
}

export async function seedCredentials(db: SeedDatabase): Promise<void> {
  const password = getSeedPassword();

  for (const account of ACCOUNTS) {
    const roleId = await ensureRole(db, account.role);
    const departmentId = await ensureDepartment(db, account.department);
    const positionId = await ensurePosition(db, account.position, departmentId);
    const userId = await ensureUser(db, {
      userCode: account.userCode,
      fullName: account.fullName,
      departmentId,
      positionId,
    });

    await ensureCredential(db, account, roleId, userId, password);
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
