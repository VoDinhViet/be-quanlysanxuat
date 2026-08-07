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
  'clients:read',
  'clients:create',
  'clients:update',
  'clients:delete',
  'items:read',
  'items:create',
  'items:update',
  'items:copy',
  'items:bom-manage',
  'operations:read',
  'suppliers:read',
  'suppliers:create',
  'suppliers:update',
  'suppliers:delete',
  'orders:read',
  'orders:create',
  'orders:update',
  'orders:approve',
  'inventory:read',
  'inventory:create',
  'inventory:update',
  'inventory:delete',
  'production:read',
  'production:create',
  'production:update',
  'production:approve',
  'purchase-requests:read',
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
