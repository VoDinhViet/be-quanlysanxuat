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
  'roles:read',
  'roles:create',
  'roles:update',
  'roles:delete',
  'clients:read',
  'clients:create',
  'clients:update',
  'clients:delete',
  'products:read',
  'products:create',
  'products:update',
  'products:delete',
  'products:copy',
  'products:revisions-manage',
  'operations:read',
  'operations:create',
  'operations:update',
  'operations:delete',
  // Only the codes actually wired to a route: materials currently exposes list + create.
  'materials:read',
  'materials:create',
  'suppliers:read',
  'suppliers:create',
  'suppliers:update',
  'suppliers:delete',
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
