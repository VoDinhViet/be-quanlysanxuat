import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export enum RoleStatus {
  Active = 'active',
  Inactive = 'inactive',
}

export const roleStatusEnum = pgEnum('role_status', [RoleStatus.Active, RoleStatus.Inactive]);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    status: roleStatusEnum('status').notNull().default(RoleStatus.Active),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('roles_code_unique').on(table.code)],
);
