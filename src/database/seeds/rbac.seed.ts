import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { hash } from 'bcryptjs';
import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { Role } from '../../constants/role.constant';
import * as schema from '../schemas';
import { permissions } from '../schemas/rbac/permissions';
import { rolePermissions } from '../schemas/rbac/role-permissions';
import { roles } from '../schemas/rbac/roles';
import { UserStatus, users } from '../schemas/users';

type PermissionSeed = {
  code: string;
  name: string;
  group: string;
};

type RoleSeed = typeof roles.$inferInsert;

type DefaultUserSeed = {
  roleCode: Role;
  email: string;
  fullName: string;
  code: string;
};

type RoleIdByCode = Map<Role, string>;
type PermissionIdByCode = Map<string, string>;

export const rbacRolesSeed: RoleSeed[] = [
  {
    code: Role.ADMIN,
    name: 'Quản trị viên',
    description: 'Toàn quyền với hệ thống',
  },
  {
    code: Role.DIRECTOR,
    name: 'Giám đốc',
    description: 'Toàn quyền nghiệp vụ và duyệt yêu cầu từ các bộ phận',
  },
  {
    code: Role.QC,
    name: 'Kiểm tra chất lượng',
    description: 'Duyệt công đoạn sản xuất và duyệt sản phẩm/vật liệu trước khi nhập kho',
  },
  {
    code: Role.BUSINESS,
    name: 'Kinh doanh',
    description: 'Quản lý đơn hàng, báo giá, sản phẩm và khách hàng',
  },
  {
    code: Role.PRODUCTION_MANAGER,
    name: 'Quản lý sản xuất',
    description: 'Quản lý quy trình sản xuất, công đoạn và yêu cầu nguyên vật liệu',
  },
  {
    code: Role.PROCUREMENT_MANAGER,
    name: 'Quản lý thu mua',
    description: 'Quản lý nhà cung cấp và phiếu đặt hàng nguyên vật liệu',
  },
  {
    code: Role.WAREHOUSE,
    name: 'Kho',
    description: 'Quản lý nhập kho, xuất kho, trả hàng và tồn kho',
  },
];

export const rbacPermissionsSeed: PermissionSeed[] = [
  { group: 'system', code: 'system:manage', name: 'Toàn quyền với hệ thống' },
  { group: 'users', code: 'users:create', name: 'Thêm người dùng' },
  { group: 'users', code: 'users:update', name: 'Sửa người dùng' },
  { group: 'users', code: 'users:delete', name: 'Xóa người dùng' },
  { group: 'roles', code: 'roles:manage', name: 'Quản lý vai trò' },
  { group: 'orders', code: 'orders:create', name: 'Thêm đơn hàng' },
  { group: 'orders', code: 'orders:read', name: 'Xem đơn hàng' },
  { group: 'orders', code: 'orders:update', name: 'Sửa đơn hàng' },
  { group: 'orders', code: 'orders:delete', name: 'Xóa đơn hàng' },
  { group: 'orders', code: 'orders:approve', name: 'Duyệt đơn hàng' },
  { group: 'quotations', code: 'quotations:manage', name: 'Lên báo giá cho đơn hàng' },
  { group: 'clients', code: 'clients:manage', name: 'Quản lý khách hàng' },
  { group: 'products', code: 'products:create', name: 'Tạo sản phẩm' },
  { group: 'production', code: 'production-processes:manage', name: 'Quản lý quy trình sản xuất' },
  { group: 'production', code: 'production-processes:approve', name: 'Duyệt quy trình sản xuất' },
  { group: 'production', code: 'production-stages:manage', name: 'Thêm/sửa công đoạn sản xuất' },
  { group: 'production', code: 'production-stages:approve', name: 'Duyệt công đoạn sản xuất' },
  { group: 'materials', code: 'material-requests:create', name: 'Tạo yêu cầu nguyên vật liệu' },
  { group: 'materials', code: 'material-requests:read', name: 'Liệt kê yêu cầu nguyên vật liệu' },
  { group: 'materials', code: 'material-requests:approve', name: 'Duyệt yêu cầu nguyên vật liệu' },
  { group: 'procurement', code: 'suppliers:read', name: 'Xem nhà cung cấp' },
  { group: 'procurement', code: 'suppliers:create', name: 'Thêm nhà cung cấp' },
  { group: 'procurement', code: 'suppliers:update', name: 'Sửa nhà cung cấp' },
  { group: 'procurement', code: 'suppliers:delete', name: 'Xóa nhà cung cấp' },
  { group: 'procurement', code: 'suppliers:manage', name: 'Quản lý nhà cung cấp' },
  {
    group: 'procurement',
    code: 'supplier-shortlists:create',
    name: 'Tạo danh sách nhà cung cấp theo yêu cầu nguyên vật liệu',
  },
  {
    group: 'procurement',
    code: 'purchase-orders:manage',
    name: 'Quản lý phiếu đặt hàng nguyên vật liệu',
  },
  {
    group: 'procurement',
    code: 'purchase-orders:approve',
    name: 'Duyệt đơn đặt hàng nguyên vật liệu',
  },
  { group: 'warehouse', code: 'warehouse-receipts:create', name: 'Tạo phiếu nhập kho' },
  { group: 'warehouse', code: 'warehouse-receipts:approve', name: 'Duyệt đơn nhập kho' },
  { group: 'warehouse', code: 'warehouse-issues:create', name: 'Tạo phiếu xuất kho' },
  { group: 'warehouse', code: 'warehouse-issues:approve', name: 'Duyệt đơn xuất kho' },
  { group: 'warehouse', code: 'warehouse-returns:create', name: 'Tạo phiếu trả hàng' },
  { group: 'warehouse', code: 'warehouse-returns:approve', name: 'Duyệt đơn trả hàng' },
  { group: 'warehouse', code: 'warehouse-inventory:manage', name: 'Quản lý sản phẩm trong kho' },
  {
    group: 'qc',
    code: 'qc-stock-in-quality:approve',
    name: 'Duyệt sản phẩm/vật liệu trước khi nhập kho',
  },
];

const allPermissionCodes = rbacPermissionsSeed.map((permission) => permission.code);

export const rbacRolePermissionCodesSeed: Record<Role, string[]> = {
  [Role.ADMIN]: allPermissionCodes,
  [Role.DIRECTOR]: allPermissionCodes,
  [Role.QC]: ['production-stages:approve', 'qc-stock-in-quality:approve'],
  [Role.BUSINESS]: [
    'orders:create',
    'orders:read',
    'orders:update',
    'orders:delete',
    'quotations:manage',
    'clients:manage',
    'products:create',
  ],
  [Role.PRODUCTION_MANAGER]: [
    'production-processes:manage',
    'production-stages:manage',
    'material-requests:create',
    'material-requests:read',
  ],
  [Role.PROCUREMENT_MANAGER]: [
    'suppliers:read',
    'suppliers:create',
    'suppliers:update',
    'suppliers:delete',
    'suppliers:manage',
    'supplier-shortlists:create',
    'purchase-orders:manage',
  ],
  [Role.WAREHOUSE]: [
    'warehouse-receipts:create',
    'warehouse-issues:create',
    'warehouse-returns:create',
    'warehouse-inventory:manage',
  ],
};

export const defaultUsersSeed: DefaultUserSeed[] = [
  {
    roleCode: Role.ADMIN,
    email: 'admin@example.com',
    fullName: 'Admin',
    code: 'US0001',
  },
  {
    roleCode: Role.DIRECTOR,
    email: 'director@example.com',
    fullName: 'Director',
    code: 'US0002',
  },
  {
    roleCode: Role.QC,
    email: 'qc@example.com',
    fullName: 'QC',
    code: 'US0003',
  },
  {
    roleCode: Role.BUSINESS,
    email: 'business@example.com',
    fullName: 'Business',
    code: 'US0004',
  },
  {
    roleCode: Role.PRODUCTION_MANAGER,
    email: 'production.manager@example.com',
    fullName: 'Production Manager',
    code: 'US0005',
  },
  {
    roleCode: Role.PROCUREMENT_MANAGER,
    email: 'procurement.manager@example.com',
    fullName: 'Procurement Manager',
    code: 'US0006',
  },
  {
    roleCode: Role.WAREHOUSE,
    email: 'warehouse@example.com',
    fullName: 'Warehouse',
    code: 'US0007',
  },
];

type RbacSeedDb = ReturnType<typeof drizzle<typeof schema>>;

export async function seedRbac(db: RbacSeedDb): Promise<void> {
  await db.insert(roles).values(rbacRolesSeed).onConflictDoNothing({ target: roles.code });
  await db
    .insert(permissions)
    .values(rbacPermissionsSeed)
    .onConflictDoNothing({ target: permissions.code });

  const roleIdByCode = await getRoleIdByCode(db);
  const permissionIdByCode = await getPermissionIdByCode(db);
  const rolePermissionRows = buildRolePermissionRows(roleIdByCode, permissionIdByCode);

  if (rolePermissionRows.length > 0) {
    await db.insert(rolePermissions).values(rolePermissionRows).onConflictDoNothing();
  }

  await seedDefaultUsers(db, roleIdByCode);
}

async function getRoleIdByCode(db: RbacSeedDb): Promise<RoleIdByCode> {
  const roleRows = await db
    .select({ id: roles.id, code: roles.code })
    .from(roles)
    .where(
      inArray(
        roles.code,
        rbacRolesSeed.map((role) => role.code),
      ),
    );

  return new Map(roleRows.map((role) => [role.code as Role, role.id]));
}

async function getPermissionIdByCode(db: RbacSeedDb): Promise<PermissionIdByCode> {
  const permissionRows = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions)
    .where(
      inArray(
        permissions.code,
        rbacPermissionsSeed.map((permission) => permission.code),
      ),
    );

  return new Map(permissionRows.map((permission) => [permission.code, permission.id]));
}

function buildRolePermissionRows(
  roleIdByCode: RoleIdByCode,
  permissionIdByCode: PermissionIdByCode,
): (typeof rolePermissions.$inferInsert)[] {
  return Object.entries(rbacRolePermissionCodesSeed).flatMap(
    ([roleCode, permissionCodes]): (typeof rolePermissions.$inferInsert)[] => {
      const typedRoleCode = roleCode as Role;
      const roleId = roleIdByCode.get(typedRoleCode);

      if (!roleId) return [];

      return permissionCodes.flatMap((permissionCode) => {
        const permissionId = permissionIdByCode.get(permissionCode);

        if (!permissionId) return [];

        return { roleId, permissionId };
      });
    },
  );
}

async function seedDefaultUsers(db: RbacSeedDb, roleIdByCode: RoleIdByCode): Promise<void> {
  const defaultPassword = getDefaultPassword();
  const password = await hash(defaultPassword, 10);

  const rows = defaultUsersSeed.map((user) => {
    const roleId = roleIdByCode.get(user.roleCode);

    if (typeof roleId !== 'string') {
      throw new Error(`Role ${user.roleCode} not found`);
    }

    return {
      email: user.email,
      fullName: user.fullName,
      code: user.code,
      password,
      roleId,
      status: UserStatus.ACTIVE,
    };
  });

  await db
    .insert(users)
    .values(rows)
    .onConflictDoUpdate({
      target: users.email,
      set: {
        fullName: sql.raw(`excluded.${users.fullName.name}`),
        code: sql.raw(`excluded.${users.code.name}`),
        password: sql.raw(`excluded.${users.password.name}`),
        roleId: sql.raw(`excluded.${users.roleId.name}`),
        status: UserStatus.ACTIVE,
        updatedAt: new Date(),
      },
    });
}

function getDefaultPassword(): string {
  return process.env.DEFAULT_USER_PASSWORD || '123456';
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedRbac(db);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('RBAC seeded successfully');
      console.log(`Default user password: ${getDefaultPassword()}`);
    })
    .catch((error) => {
      console.error('Failed to seed RBAC');
      console.error(error);
      process.exit(1);
    });
}
