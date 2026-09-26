/**
 * The authoritative catalogue of permission codes, written as `resource:action`. The single
 * source of truth for *what actions exist* in the system.
 *
 * Rules:
 * - It's a runtime array (not just a type) so it can be used both for compile-time typing
 *   (`PermissionCode`) and at runtime — to validate the permission codes assigned to a role and
 *   to build the grouped catalogue the frontend renders in the role editor.
 * - Roles (stored in the DB) reference these codes; permissions themselves are never created at
 *   runtime — adding a new capability means adding a code here and deploying.
 */
export const PERMISSION_CODES = [
  'system:manage',
  'users:create',
  'users:update',
  'roles:read',
  'roles:create',
  'roles:update',
  'roles:delete',
  'departments:read',
  'departments:create',
  'departments:update',
  'departments:delete',
  'positions:read',
  'positions:create',
  'positions:update',
  'positions:delete',
  'clients:read',
  'clients:create',
  'clients:update',
  'clients:delete',
  'items:read',
  'items:create',
  'items:update',
  'items:delete',
  'items:copy',
  'items:bom-manage',
  'operations:read',
  'operations:create',
  'operations:update',
  'operations:delete',
  'suppliers:read',
  'suppliers:create',
  'suppliers:update',
  'suppliers:delete',
  'orders:read',
  'orders:create',
  'orders:update',
  'orders:approve',
  'orders:delete',
  'inventory:read',
  'inventory:create',
  'inventory:update',
  'inventory:delete',
  'inventory-requisitions:read',
  'inventory-requisitions:create',
  'inventory-requisitions:update',
  'inventory-requisitions:delete',
  'inventory-requisitions:approve',
  // Nghỉ hưu cùng route `POST /inventory-requisitions/:id/issue` (đã bỏ, `approve` giờ tự sinh
  // PXK) — giữ lại để `roles.permissions` cũ giữ code này không bị RolesService.onModuleInit cảnh
  // báo "unknown permission code".
  'inventory-requisitions:issue',
  'production:read',
  'production:create',
  'production:update',
  'production:approve',
  'production-execution:read',
  'production-execution:report',
  'production-execution:read-all',
  'purchase-requests:read',
  'purchase-requests:create',
  'purchase-requests:update',
  'purchase-requests:delete',
  'purchase-requests:approve',
  'purchasing:read',
  'purchasing:create',
  'purchasing:update',
  'purchasing:delete',
  'purchasing:approve',
  'iqc:read',
  'iqc:create',
  'iqc:update',
  'iqc:delete',
  'outsourcing:read',
  'outsourcing:create',
  'outsourcing:update',
  'outsourcing:delete',
  'oqc:read',
  'oqc:create',
  'oqc:update',
  'oqc:delete',
  'outbound:read',
  'outbound:create',
  'outbound:update',
  'outbound:approve',
  'outbound:delete',
  'reports:read',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/**
 * The "god-mode" permission: a role holding this code passes every authorization check,
 * regardless of the specific permission a route requires. Assigned to the Super Admin role.
 */
export const SUPER_PERMISSION: PermissionCode = 'system:manage';

/** Runtime `Set` for O(1) membership checks when validating role permission payloads. */
export const PERMISSION_CODE_SET: ReadonlySet<string> = new Set(
  PERMISSION_CODES,
);

export const isPermissionCode = (value: string): value is PermissionCode =>
  PERMISSION_CODE_SET.has(value);

/** Vietnamese label for every permission code */
export const PERMISSION_LABELS: Record<PermissionCode, string> = {
  'system:manage': 'Toàn quyền hệ thống (Super Admin)',
  'users:create': 'Tạo nhân sự',
  'users:update': 'Sửa nhân sự',
  'roles:read': 'Xem vai trò',
  'roles:create': 'Tạo vai trò',
  'roles:update': 'Sửa vai trò',
  'roles:delete': 'Xoá vai trò',
  'departments:read': 'Xem phòng ban',
  'departments:create': 'Tạo phòng ban',
  'departments:update': 'Sửa phòng ban',
  'departments:delete': 'Xoá phòng ban',
  'positions:read': 'Xem chức vụ',
  'positions:create': 'Tạo chức vụ',
  'positions:update': 'Sửa chức vụ',
  'positions:delete': 'Xoá chức vụ',
  'clients:read': 'Xem khách hàng',
  'clients:create': 'Tạo khách hàng',
  'clients:update': 'Sửa khách hàng',
  'clients:delete': 'Xoá khách hàng',
  'items:read': 'Xem sản phẩm & vật tư',
  'items:create': 'Tạo sản phẩm & vật tư',
  'items:update': 'Sửa sản phẩm & vật tư',
  'items:delete': 'Xoá sản phẩm & vật tư',
  'items:copy': 'Sao chép sản phẩm & vật tư',
  'items:bom-manage': 'Quản lý BOM & quy trình',
  'operations:read': 'Xem công đoạn',
  'operations:create': 'Tạo công đoạn',
  'operations:update': 'Sửa công đoạn',
  'operations:delete': 'Xoá công đoạn',
  'suppliers:read': 'Xem nhà cung cấp',
  'suppliers:create': 'Tạo nhà cung cấp',
  'suppliers:update': 'Sửa nhà cung cấp',
  'suppliers:delete': 'Xoá nhà cung cấp',
  'orders:read': 'Xem đơn hàng',
  'orders:create': 'Tạo đơn hàng',
  'orders:update': 'Sửa đơn hàng',
  'orders:approve': 'Duyệt đơn hàng',
  'orders:delete': 'Xoá đơn hàng',
  'inventory:read': 'Xem kho',
  'inventory:create': 'Tạo phiếu kho',
  'inventory:update': 'Sửa phiếu kho',
  'inventory:delete': 'Xoá phiếu kho',
  'inventory-requisitions:read': 'Xem phiếu lãnh vật tư',
  'inventory-requisitions:create': 'Tạo phiếu lãnh vật tư',
  'inventory-requisitions:update': 'Sửa phiếu lãnh vật tư',
  'inventory-requisitions:delete': 'Xoá phiếu lãnh vật tư',
  'inventory-requisitions:approve': 'Duyệt phiếu lãnh vật tư',
  'inventory-requisitions:issue': 'Xuất kho theo phiếu lãnh',
  'production:read': 'Xem sản xuất',
  'production:create': 'Tạo lệnh/kế hoạch sản xuất',
  'production:update': 'Sửa lệnh/kế hoạch sản xuất',
  'production:approve': 'Duyệt lệnh sản xuất',
  'production-execution:read': 'Xem màn Thực hiện sản xuất',
  'production-execution:report': 'Báo cáo sản lượng (Thực hiện sản xuất)',
  'production-execution:read-all':
    'Xem mọi công đoạn (không giới hạn theo phân công)',
  'purchase-requests:read': 'Xem đề xuất mua hàng',
  'purchase-requests:create': 'Tạo đề xuất mua hàng',
  'purchase-requests:update': 'Sửa đề xuất mua hàng',
  'purchase-requests:delete': 'Xoá đề xuất mua hàng',
  'purchase-requests:approve': 'Duyệt đề xuất mua hàng',
  'purchasing:read': 'Xem mua hàng (RFQ/PO/thanh toán)',
  'purchasing:create': 'Tạo RFQ/PO/yêu cầu thanh toán',
  'purchasing:update': 'Sửa RFQ/PO/yêu cầu thanh toán',
  'purchasing:delete': 'Xoá RFQ/PO/yêu cầu thanh toán',
  'purchasing:approve': 'Duyệt RFQ/PO/yêu cầu thanh toán',
  'iqc:read': 'Xem IQC',
  'iqc:create': 'Tạo phiếu IQC',
  'iqc:update': 'Sửa phiếu IQC',
  'iqc:delete': 'Xoá phiếu IQC',
  'outsourcing:read': 'Xem gia công ngoài',
  'outsourcing:create': 'Tạo phiếu gia công ngoài',
  'outsourcing:update': 'Sửa phiếu gia công ngoài',
  'outsourcing:delete': 'Xoá phiếu gia công ngoài',
  'oqc:read': 'Xem OQC',
  'oqc:create': 'Tạo phiếu OQC',
  'oqc:update': 'Sửa phiếu OQC',
  'oqc:delete': 'Xoá phiếu OQC',
  'outbound:read': 'Xem giao hàng',
  'outbound:create': 'Tạo phiếu giao hàng',
  'outbound:update': 'Sửa phiếu giao hàng',
  'outbound:approve': 'Duyệt phiếu giao hàng',
  'outbound:delete': 'Xóa phiếu giao hàng',
  'reports:read': 'Xem báo cáo tổng quan',
};

export const PERMISSION_ITEM_DESCRIPTIONS: Partial<
  Record<PermissionCode, string>
> = {
  'production-execution:report':
    'Gửi báo cáo sản lượng hoàn thành / không đạt ở màn Thực hiện sản xuất',
  'production-execution:read-all':
    'Xem và báo cáo mọi công đoạn, bỏ giới hạn theo công đoạn được phân công (dành cho quản lý/điều độ)',
  'items:copy':
    'Nhân bản nhanh thông tin sản phẩm và định mức vật tư sang mã mới',
  'items:bom-manage':
    'Quản lý công thức định mức nguyên vật liệu (BOM) và công đoạn',
  'inventory-requisitions:issue':
    'Xác nhận thực xuất vật tư khỏi kho theo phiếu đã duyệt',
};

export type PermissionCatalogueItem = {
  code: PermissionCode;
  action: string;
  label: string;
  description?: string;
};

/**
 * Business block a resource group belongs to in the role editor's permission matrix —
 * the frontend renders one sticky section header per block, in this list's order.
 */
export const PERMISSION_BLOCK_KEYS = [
  'system',
  'catalog',
  'sales',
  'warehouse',
  'production',
  'purchasing',
  'quality',
  'reports',
] as const;

export type PermissionBlockKey = (typeof PERMISSION_BLOCK_KEYS)[number];

export const PERMISSION_BLOCK_LABELS: Record<PermissionBlockKey, string> = {
  system: 'Hệ thống',
  catalog: 'Danh mục',
  sales: 'Bán hàng',
  warehouse: 'Kho',
  production: 'Sản xuất',
  purchasing: 'Mua hàng',
  quality: 'Chất lượng',
  reports: 'Báo cáo',
};

export type PermissionCatalogueGroup = {
  resource: string;
  block: PermissionBlockKey;
  blockLabel: string;
  label: string;
  description: string;
  codes: PermissionCode[];
  permissions: PermissionCatalogueItem[];
};

type PermissionGroupDef = {
  resource: string;
  block: PermissionBlockKey;
  label: string;
  description: string;
  codes: PermissionCode[];
};

/**
 * Source rows for the grouped permission catalogue below — one entry per resource, already
 * ordered by business block so the frontend can bucket consecutive rows sharing the same
 * `block` without keeping its own resource → block mapping in sync with this file.
 * Excludes superadmin system:manage since it is reserved for system admin only.
 */
const PERMISSION_GROUP_DEFS: PermissionGroupDef[] = [
  {
    resource: 'users',
    block: 'system',
    description:
      'Quản lý danh sách nhân sự, tài khoản đăng nhập và phân quyền truy cập hệ thống',
    label: 'Nhân sự',
    codes: ['users:create', 'users:update'],
  },
  {
    resource: 'roles',
    block: 'system',
    description:
      'Thiết lập vai trò, nhóm quyền chức năng và chính sách bảo mật nội bộ',
    label: 'Phân quyền',
    codes: ['roles:read', 'roles:create', 'roles:update', 'roles:delete'],
  },
  {
    resource: 'departments',
    block: 'system',
    description: 'Quản lý cơ cấu phòng ban, sơ đồ tổ chức doanh nghiệp',
    label: 'Phòng ban',
    codes: [
      'departments:read',
      'departments:create',
      'departments:update',
      'departments:delete',
    ],
  },
  {
    resource: 'positions',
    block: 'system',
    description: 'Định danh chức danh, vị trí công tác và trách nhiệm nhiệm vụ',
    label: 'Chức vụ',
    codes: [
      'positions:read',
      'positions:create',
      'positions:update',
      'positions:delete',
    ],
  },
  {
    resource: 'clients',
    block: 'catalog',
    description:
      'Quản lý hồ sơ đối tác khách hàng, phân nhóm và thông tin liên hệ',
    label: 'Khách hàng',
    codes: [
      'clients:read',
      'clients:create',
      'clients:update',
      'clients:delete',
    ],
  },
  {
    resource: 'items',
    block: 'catalog',
    description:
      'Danh mục sản phẩm, bán thành phẩm, nguyên vật liệu và định mức kỹ thuật BOM',
    label: 'Sản phẩm & vật tư',
    codes: [
      'items:read',
      'items:create',
      'items:update',
      'items:delete',
      'items:copy',
      'items:bom-manage',
    ],
  },
  {
    resource: 'operations',
    block: 'catalog',
    description:
      'Quy trình công nghệ, các bước công đoạn gia công và định mức thời gian',
    label: 'Công đoạn',
    codes: [
      'operations:read',
      'operations:create',
      'operations:update',
      'operations:delete',
    ],
  },
  {
    resource: 'suppliers',
    block: 'catalog',
    description:
      'Danh bạ nhà cung cấp vật tư, thông tin giao dịch và điều khoản mua hàng',
    label: 'Nhà cung cấp',
    codes: [
      'suppliers:read',
      'suppliers:create',
      'suppliers:update',
      'suppliers:delete',
    ],
  },
  {
    resource: 'orders',
    block: 'sales',
    description:
      'Quản lý đơn đặt hàng bán (SO), tiến độ thực hiện và giao nhận hàng',
    label: 'Đơn hàng (SO)',
    codes: [
      'orders:read',
      'orders:create',
      'orders:update',
      'orders:approve',
      'orders:delete',
    ],
  },
  {
    resource: 'outbound',
    block: 'sales',
    description:
      'Lập phiếu giao hàng (DO), kế hoạch vận chuyển và bàn giao sản phẩm',
    label: 'Giao hàng (DO)',
    codes: [
      'outbound:read',
      'outbound:create',
      'outbound:update',
      'outbound:approve',
      'outbound:delete',
    ],
  },
  {
    resource: 'inventory',
    block: 'warehouse',
    description:
      'Theo dõi xuất nhập tồn kho, kiểm kê và điều chuyển nguyên vật liệu',
    label: 'Kho (nhập/xuất/tồn)',
    codes: [
      'inventory:read',
      'inventory:create',
      'inventory:update',
      'inventory:delete',
    ],
  },
  {
    resource: 'inventory-requisitions',
    block: 'warehouse',
    description:
      'Yêu cầu xuất kho nguyên vật liệu phục vụ sản xuất theo kế hoạch',
    label: 'Lãnh vật tư',
    codes: [
      'inventory-requisitions:read',
      'inventory-requisitions:create',
      'inventory-requisitions:update',
      'inventory-requisitions:delete',
      'inventory-requisitions:approve',
      'inventory-requisitions:issue',
    ],
  },
  {
    resource: 'production',
    block: 'production',
    description:
      'Lập kế hoạch sản xuất, phát hành lệnh sản xuất và điều độ phân xưởng',
    label: 'Sản xuất',
    codes: [
      'production:read',
      'production:create',
      'production:update',
      'production:approve',
    ],
  },
  {
    resource: 'production-execution',
    block: 'production',
    description:
      'Màn Thực hiện sản xuất cho tổ/nhân sự báo cáo sản lượng — người dùng chỉ thấy và báo cáo các công đoạn mình được phân công, trừ khi có quyền xem mọi công đoạn',
    label: 'Thực hiện sản xuất',
    codes: [
      'production-execution:read',
      'production-execution:report',
      'production-execution:read-all',
    ],
  },
  {
    resource: 'purchase-requests',
    block: 'purchasing',
    description:
      'Đề xuất mua sắm nguyên vật liệu và trang thiết bị từ các bộ phận',
    label: 'Đề xuất mua hàng',
    codes: [
      'purchase-requests:read',
      'purchase-requests:create',
      'purchase-requests:update',
      'purchase-requests:delete',
      'purchase-requests:approve',
    ],
  },
  {
    resource: 'purchasing',
    block: 'purchasing',
    description:
      'Quản lý quy trình mua hàng, báo giá NCC, đơn đặt mua PO và thanh toán',
    label: 'Mua hàng (RFQ/PO/thanh toán)',
    codes: [
      'purchasing:read',
      'purchasing:create',
      'purchasing:update',
      'purchasing:delete',
      'purchasing:approve',
    ],
  },
  {
    resource: 'iqc',
    block: 'quality',
    description:
      'Kiểm tra chất lượng nguyên vật liệu đầu vào từ nhà cung cấp trước khi nhập kho',
    label: 'IQC',
    codes: ['iqc:read', 'iqc:create', 'iqc:update', 'iqc:delete'],
  },
  {
    resource: 'outsourcing',
    block: 'quality',
    description:
      'Điều phối gia công bán thành phẩm với các đơn vị gia công ngoài',
    label: 'Gia công ngoài',
    codes: [
      'outsourcing:read',
      'outsourcing:create',
      'outsourcing:update',
      'outsourcing:delete',
    ],
  },
  {
    resource: 'oqc',
    block: 'quality',
    description:
      'Kiểm tra chất lượng thành phẩm hoàn thiện trước khi đóng gói xuất xưởng',
    label: 'OQC',
    codes: ['oqc:read', 'oqc:create', 'oqc:update', 'oqc:delete'],
  },
  {
    resource: 'reports',
    block: 'reports',
    description:
      'Báo cáo tổng hợp số liệu sản xuất, chi phí, tiến độ và hiệu suất vận hành',
    label: 'Báo cáo',
    codes: ['reports:read'],
  },
];

/**
 * Grouped permission catalogue for the role configuration matrix in the frontend. Sorted by
 * block — stably, so relative order within a block matches `PERMISSION_GROUP_DEFS` — so groups
 * sharing a block always come out contiguous. The frontend's `buildPermissionMatrix` buckets
 * consecutive same-block entries into one section; without this sort that would only hold by
 * the accident of `PERMISSION_GROUP_DEFS`'s own literal order, silently breaking (splitting one
 * block into two sections) if a future resource were inserted out of block order above.
 */
export const PERMISSION_CATALOGUE_GROUPS: PermissionCatalogueGroup[] = [
  ...PERMISSION_GROUP_DEFS,
]
  .sort(
    (a, b) =>
      PERMISSION_BLOCK_KEYS.indexOf(a.block) -
      PERMISSION_BLOCK_KEYS.indexOf(b.block),
  )
  .map((g) => ({
    resource: g.resource,
    block: g.block,
    blockLabel: PERMISSION_BLOCK_LABELS[g.block],
    label: g.label,
    description: g.description,
    codes: g.codes,
    permissions: g.codes.map((code) => ({
      code,
      action: code.split(':')[1] || '',
      label: PERMISSION_LABELS[code] || code,
      description: PERMISSION_ITEM_DESCRIPTIONS[code],
    })),
  }));
