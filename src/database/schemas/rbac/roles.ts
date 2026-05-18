import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const roleStatusEnum = pgEnum('role_status', ['active', 'inactive']);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    status: roleStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex('roles_code_unique').on(table.code),
  }),
);
