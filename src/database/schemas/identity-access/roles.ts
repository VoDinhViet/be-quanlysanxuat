import {
  boolean,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import type { PermissionCode } from '../../../constants/permission.constant';

/**
 * A role is a named bundle of permission codes.
 *
 * Rules:
 * - Permissions themselves are a fixed catalogue defined in code (`PERMISSION_CODES`); a role
 *   only *references* those codes via the `permissions` array. `RolesService` validates every
 *   write against that catalogue (`E031`); a row edited outside the API can still drift, which
 *   `RolesService.onModuleInit` logs at boot (`docs/domains/identity-access.md`).
 * - `isSystem` roles (e.g. Super Admin) are seeded and protected from edit/delete.
 * - `isProtected` roles are hidden from `GET /roles`; still assignable directly by known `roleId`.
 */
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }),
  permissions: jsonb('permissions')
    .$type<PermissionCode[]>()
    .notNull()
    .default([]),
  isSystem: boolean('is_system').notNull().default(false),
  isProtected: boolean('is_protected').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
});

export type RoleSelect = typeof roles.$inferSelect;
