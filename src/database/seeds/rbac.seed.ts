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
  { group: 'system', code: 'system.manage', name: 'Toàn quyền với hệ thống' },
  { group: 'users', code: 'user.create', name: 'Thêm người dùng' },
  { group: 'users', code: 'user.update', name: 'Sửa người dùng' },
  { group: 'users', code: 'user.delete', name: 'Xóa người dùng' },
  { group: 'business', code: 'business.order.manage', name: 'Quản lý đơn hàng' },
  { group: 'business', code: 'business.order.approve', name: 'Duyệt đơn hàng' },
  { group: 'business', code: 'business.quotation.manage', name: 'Lên báo giá cho đơn hàng' },
  { group: 'clients', code: 'client.manage', name: 'Quản lý khách hàng' },
  { group: 'products', code: 'product.create', name: 'Tạo sản phẩm' },
  { group: 'production', code: 'production.process.manage', name: 'Quản lý quy trình sản xuất' },
  { group: 'production', code: 'production.process.approve', name: 'Duyệt quy trình sản xuất' },
  { group: 'production', code: 'production.stage.manage', name: 'Thêm/sửa công đoạn sản xuất' },
  { group: 'production', code: 'production.stage.approve', name: 'Duyệt công đoạn sản xuất' },
  { group: 'materials', code: 'material.request.create', name: 'Tạo yêu cầu nguyên vật liệu' },
  { group: 'materials', code: 'material.request.list', name: 'Liệt kê yêu cầu nguyên vật liệu' },
  { group: 'materials', code: 'material.request.approve', name: 'Duyệt yêu cầu nguyên vật liệu' },
  { group: 'procurement', code: 'procurement.supplier.manage', name: 'Quản lý nhà cung cấp' },
  {
    group: 'procurement',
    code: 'procurement.supplier_shortlist.create',
    name: 'Tạo danh sách nhà cung cấp theo yêu cầu nguyên vật liệu',
  },
  {
    group: 'procurement',
    code: 'procurement.purchase_order.manage',
    name: 'Quản lý phiếu đặt hàng nguyên vật liệu',
  },
  {
    group: 'procurement',
    code: 'procurement.purchase_order.approve',
    name: 'Duyệt đơn đặt hàng nguyên vật liệu',
  },
  { group: 'warehouse', code: 'warehouse.receipt.create', name: 'Tạo phiếu nhập kho' },
  { group: 'warehouse', code: 'warehouse.receipt.approve', name: 'Duyệt đơn nhập kho' },
  { group: 'warehouse', code: 'warehouse.issue.create', name: 'Tạo phiếu xuất kho' },
  { group: 'warehouse', code: 'warehouse.issue.approve', name: 'Duyệt đơn xuất kho' },
  { group: 'warehouse', code: 'warehouse.return.create', name: 'Tạo phiếu trả hàng' },
  { group: 'warehouse', code: 'warehouse.return.approve', name: 'Duyệt đơn trả hàng' },
  { group: 'warehouse', code: 'warehouse.inventory.manage', name: 'Quản lý sản phẩm trong kho' },
  {
    group: 'qc',
    code: 'qc.stock_in_quality.approve',
    name: 'Duyệt sản phẩm/vật liệu trước khi nhập kho',
  },
];

const allPermissionCodes = rbacPermissionsSeed.map((permission) => permission.code);

export const rbacRolePermissionCodesSeed: Record<Role, string[]> = {
  [Role.ADMIN]: allPermissionCodes,
  [Role.DIRECTOR]: allPermissionCodes,
  [Role.QC]: ['production.stage.approve', 'qc.stock_in_quality.approve'],
  [Role.BUSINESS]: [
    'business.order.manage',
    'business.quotation.manage',
    'client.manage',
    'product.create',
  ],
  [Role.PRODUCTION_MANAGER]: [
    'production.process.manage',
    'production.stage.manage',
    'material.request.create',
    'material.request.list',
  ],
  [Role.PROCUREMENT_MANAGER]: [
    'procurement.supplier.manage',
    'procurement.supplier_shortlist.create',
    'procurement.purchase_order.manage',
  ],
  [Role.WAREHOUSE]: [
    'warehouse.receipt.create',
    'warehouse.issue.create',
    'warehouse.return.create',
    'warehouse.inventory.manage',
  ],
};

export const defaultUsersSeed: DefaultUserSeed[] = [
  {
    roleCode: Role.ADMIN,
    email: 'admin@example.com',
    fullName: 'Admin',
  },
  {
    roleCode: Role.DIRECTOR,
    email: 'director@example.com',
    fullName: 'Director',
  },
  {
    roleCode: Role.QC,
    email: 'qc@example.com',
    fullName: 'QC',
  },
  {
    roleCode: Role.BUSINESS,
    email: 'business@example.com',
    fullName: 'Business',
  },
  {
    roleCode: Role.PRODUCTION_MANAGER,
    email: 'production.manager@example.com',
    fullName: 'Production Manager',
  },
  {
    roleCode: Role.PROCUREMENT_MANAGER,
    email: 'procurement.manager@example.com',
    fullName: 'Procurement Manager',
  },
  {
    roleCode: Role.WAREHOUSE,
    email: 'warehouse@example.com',
    fullName: 'Warehouse',
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
