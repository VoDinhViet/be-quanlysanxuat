import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  group: text('group').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
