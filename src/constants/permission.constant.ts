/**
 * The authoritative catalogue of permission codes, written as `resource:action`.
 *
 * This is the single source of truth for *what actions exist* in the system. It is a runtime
 * array (not just a type) so it can be used both for compile-time typing (`PermissionCode`)
 * and at runtime — to validate the permission codes assigned to a role and to build the
 * grouped catalogue the frontend renders in the role editor.
 *
 * Roles (stored in the DB) reference these codes; permissions themselves are never created at
 * runtime — adding a new capability means adding a code here and deploying.
 */
export const PERMISSION_CODES = [
  'system:manage',
  'users:create',
  'users:update',
  'users:delete',
  'roles:manage',
  'orders:create',
  'orders:read',
  'orders:read-production',
  'orders:update',
  'orders:delete',
  'orders:approve',
  'quotations:manage',
  'clients:manage',
  'clients:read',
  'clients:create',
  'clients:update',
  'clients:delete',
  'products:read',
  'products:create',
  'products:update',
  'products:delete',
  'products:lock',
  'products:copy',
  'products:bom-manage',
  'products:routing-manage',
  'material-requests:create',
  'material-requests:read',
  'material-requests:approve',
  'materials:read',
  'materials:create',
  'materials:update',
  'materials:delete',
  'material-groups:manage',
  'suppliers:read',
  'suppliers:create',
  'suppliers:update',
  'suppliers:delete',
  'suppliers:manage',
  'supplier-shortlists:create',
  'purchase-orders:manage',
  'purchase-orders:approve',
  'warehouse-receipts:create',
  'warehouse-receipts:approve',
  'warehouse-issues:create',
  'warehouse-issues:approve',
  'warehouse-returns:create',
  'warehouse-returns:approve',
  'warehouse-inventory:manage',
  'qc-stock-in-quality:approve',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/**
 * The "god-mode" permission: a role holding this code passes every authorization check,
 * regardless of the specific permission a route requires. Assigned to the Super Admin role.
 */
export const SUPER_PERMISSION: PermissionCode = 'system:manage';

/** Runtime `Set` for O(1) membership checks when validating role permission payloads. */
export const PERMISSION_CODE_SET: ReadonlySet<string> = new Set(PERMISSION_CODES);

export const isPermissionCode = (value: string): value is PermissionCode =>
  PERMISSION_CODE_SET.has(value);
