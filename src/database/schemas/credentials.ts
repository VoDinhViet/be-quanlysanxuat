import { relations } from 'drizzle-orm';
import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { roles } from './roles';

/**
 * Login credentials only — personal/HR info (name, gender, DOB, phone) lives on `users`.
 * There is no active/inactive flag here either: an employee's ERP account is only ever as
 * "active" as `users.status` (WORKING/RESIGNED) says it is; accounts with no linked
 * user are always considered active.
 *
 * Authorization is anchored here: `roleId` links the login identity (the JWT `sub`) to a
 * role, so the permission layer resolves permissions straight from the token subject without
 * needing a `users` row.
 */
export const credentials = pgTable('credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  roleId: uuid('role_id').references(() => roles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const credentialsRelations = relations(credentials, ({ one }) => ({
  role: one(roles, {
    fields: [credentials.roleId],
    references: [roles.id],
  }),
}));
