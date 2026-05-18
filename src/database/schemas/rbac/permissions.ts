import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    module: text('module').notNull(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    code: text('code').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex('permissions_code_unique').on(table.code),
    moduleResourceActionUnique: uniqueIndex('permissions_module_resource_action_unique').on(
      table.module,
      table.resource,
      table.action,
    ),
  }),
);
