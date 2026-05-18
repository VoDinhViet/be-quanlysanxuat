import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

import { permissions } from './permissions';
import { roles } from './roles';

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
    permissionIdx: index('role_permissions_permission_id_idx').on(table.permissionId),
  }),
);
