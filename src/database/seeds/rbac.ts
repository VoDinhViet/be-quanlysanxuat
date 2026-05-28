import { inArray } from 'drizzle-orm';

import { permissions } from '../schemas/rbac/permissions';
import { rolePermissions } from '../schemas/rbac/role-permissions';
import { roles } from '../schemas/rbac/roles';

export const rbacRolesSeed = [
  {
    code: 'admin',
    name: 'Quản trị viên',
    description: 'Toàn quyền với hệ thống',
    isSystem: true,
  },
  {
    code: 'director',
    name: 'Giám đốc',
    description: 'Toàn quyền nghiệp vụ và duyệt yêu cầu từ các bộ phận',
    isSystem: true,
  },
  {
    code: 'qc',
    name: 'Kiểm tra chất lượng',
    description:
      'Duyệt công đoạn sản xuất và duyệt sản phẩm/vật liệu trước khi nhập kho',
    isSystem: true,
  },
  {
    code: 'sales',
    name: 'Kinh doanh',
    description: 'Quản lý đơn hàng, báo giá, sản phẩm và khách hàng',
    isSystem: true,
  },
  {
    code: 'production_manager',
    name: 'Quản lý sản xuất',
    description:
      'Quản lý quy trình sản xuất, công đoạn và yêu cầu nguyên vật liệu',
    isSystem: true,
  },
  {
    code: 'procurement_manager',
    name: 'Quản lý thu mua',
    description: 'Quản lý nhà cung cấp và phiếu đặt hàng nguyên vật liệu',
    isSystem: true,
  },
  {
    code: 'warehouse',
    name: 'Kho',
    description: 'Quản lý nhập kho, xuất kho, trả hàng và tồn kho',
    isSystem: true,
  },
] as const;

export const rbacPermissionsSeed = [
  ['system', 'all', 'manage', 'system.manage', 'Toàn quyền với hệ thống'],
  ['employee', 'employee', 'create', 'employee.create', 'Thêm nhân viên'],
  ['employee', 'employee', 'update', 'employee.update', 'Sửa nhân viên'],
  ['employee', 'employee', 'delete', 'employee.delete', 'Xóa nhân viên'],
  ['sales', 'order', 'manage', 'sales.order.manage', 'Quản lý đơn hàng'],
  ['sales', 'order', 'approve', 'sales.order.approve', 'Duyệt đơn hàng'],
  [
    'sales',
    'quotation',
    'manage',
    'sales.quotation.manage',
    'Lên báo giá cho đơn hàng',
  ],
  [
    'sales',
    'customer',
    'manage',
    'sales.customer.manage',
    'Quản lý khách hàng',
  ],
  ['product', 'product', 'create', 'product.create', 'Tạo sản phẩm'],
  [
    'production',
    'process',
    'manage',
    'production.process.manage',
    'Quản lý quy trình sản xuất',
  ],
  [
    'production',
    'process',
    'approve',
    'production.process.approve',
    'Duyệt quy trình sản xuất',
  ],
  [
    'production',
    'stage',
    'manage',
    'production.stage.manage',
    'Thêm/sửa công đoạn sản xuất',
  ],
  [
    'production',
    'stage',
    'approve',
    'production.stage.approve',
    'Duyệt công đoạn sản xuất',
  ],
  [
    'material',
    'material_request',
    'create',
    'material.request.create',
    'Tạo yêu cầu nguyên vật liệu',
  ],
  [
    'material',
    'material_request',
    'list',
    'material.request.list',
    'Liệt kê yêu cầu nguyên vật liệu',
  ],
  [
    'material',
    'material_request',
    'approve',
    'material.request.approve',
    'Duyệt yêu cầu nguyên vật liệu',
  ],
  [
    'procurement',
    'supplier',
    'manage',
    'procurement.supplier.manage',
    'Quản lý nhà cung cấp',
  ],
  [
    'procurement',
    'supplier_shortlist',
    'create',
    'procurement.supplier_shortlist.create',
    'Tạo danh sách nhà cung cấp theo yêu cầu nguyên vật liệu',
  ],
  [
    'procurement',
    'purchase_order',
    'manage',
    'procurement.purchase_order.manage',
    'Quản lý phiếu đặt hàng nguyên vật liệu',
  ],
  [
    'procurement',
    'purchase_order',
    'approve',
    'procurement.purchase_order.approve',
    'Duyệt đơn đặt hàng nguyên vật liệu',
  ],
  [
    'warehouse',
    'receipt',
    'create',
    'warehouse.receipt.create',
    'Tạo phiếu nhập kho',
  ],
  [
    'warehouse',
    'receipt',
    'approve',
    'warehouse.receipt.approve',
    'Duyệt đơn nhập kho',
  ],
  [
    'warehouse',
    'issue',
    'create',
    'warehouse.issue.create',
    'Tạo phiếu xuất kho',
  ],
  [
    'warehouse',
    'issue',
    'approve',
    'warehouse.issue.approve',
    'Duyệt đơn xuất kho',
  ],
  [
    'warehouse',
    'return',
    'create',
    'warehouse.return.create',
    'Tạo phiếu trả hàng',
  ],
  [
    'warehouse',
    'return',
    'approve',
    'warehouse.return.approve',
    'Duyệt đơn trả hàng',
  ],
  [
    'warehouse',
    'inventory',
    'manage',
    'warehouse.inventory.manage',
    'Quản lý sản phẩm trong kho',
  ],
  [
    'qc',
    'stock_in_quality',
    'approve',
    'qc.stock_in_quality.approve',
    'Duyệt sản phẩm/vật liệu trước khi nhập kho',
  ],
].map(([module, resource, action, code, description]) => ({
  module,
  resource,
  action,
  code,
  description,
}));

const allPermissionCodes = rbacPermissionsSeed.map(
  (permission) => permission.code,
);

export const rbacRolePermissionCodesSeed = {
  admin: allPermissionCodes,
  director: allPermissionCodes,
  qc: ['production.stage.approve', 'qc.stock_in_quality.approve'],
  sales: [
    'sales.order.manage',
    'sales.quotation.manage',
    'sales.customer.manage',
    'product.create',
  ],
  production_manager: [
    'production.process.manage',
    'production.stage.manage',
    'material.request.create',
    'material.request.list',
  ],
  procurement_manager: [
    'procurement.supplier.manage',
    'procurement.supplier_shortlist.create',
    'procurement.purchase_order.manage',
  ],
  warehouse: [
    'warehouse.receipt.create',
    'warehouse.issue.create',
    'warehouse.return.create',
    'warehouse.inventory.manage',
  ],
} as const;

type SeedDb = {
  insert: (table: unknown) => {
    values: (values: unknown) => {
      onConflictDoNothing: (config?: unknown) => Promise<unknown>;
    };
  };
  select: () => {
    from: (table: unknown) => {
      where: (condition: unknown) => Promise<Record<string, unknown>[]>;
    };
  };
};

export async function seedRbac(db: SeedDb) {
  await db
    .insert(roles)
    .values(rbacRolesSeed)
    .onConflictDoNothing({ target: roles.code });
  await db
    .insert(permissions)
    .values(rbacPermissionsSeed)
    .onConflictDoNothing({ target: permissions.code });

  const roleRows = await db
    .select()
    .from(roles)
    .where(
      inArray(
        roles.code,
        rbacRolesSeed.map((role) => role.code),
      ),
    );

  const permissionRows = await db
    .select()
    .from(permissions)
    .where(
      inArray(
        permissions.code,
        rbacPermissionsSeed.map((permission) => permission.code),
      ),
    );

  const roleIdByCode = new Map(roleRows.map((role) => [role.code, role.id]));
  const permissionIdByCode = new Map(
    permissionRows.map((permission) => [permission.code, permission.id]),
  );

  const rows = Object.entries(rbacRolePermissionCodesSeed).flatMap(
    ([roleCode, permissionCodes]) => {
      const roleId = roleIdByCode.get(roleCode);

      if (!roleId) return [];

      return permissionCodes.flatMap((permissionCode) => {
        const permissionId = permissionIdByCode.get(permissionCode);

        if (!permissionId) return [];

        return { roleId, permissionId };
      });
    },
  );

  if (rows.length === 0) return;

  await db.insert(rolePermissions).values(rows).onConflictDoNothing();
}
