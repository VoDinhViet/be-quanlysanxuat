import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { items } from './items';
import { routingOperations } from './routing-operations';
import { users } from '../identity-access/users';

/**
 * Header row: đúng một routing Cấp 0 mỗi item (FG/WIP) — chuỗi công đoạn của chính item gốc, hiển
 * thị như dòng "STT 0" của lưới cấu trúc, vd. Cắt laser → Chấn → Hàn → Sơn tĩnh điện. Cùng khuôn
 * `boms`/`bom_items`. RM không có routing Cấp 0 (service-enforced). Body rows sống ở
 * `routing_operations`.
 */
export const routings = pgTable(
  'routings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .unique()
      .references(() => items.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('idx_routings_created_by').on(table.createdBy)],
);

export const routingsRelations = relations(routings, ({ one, many }) => ({
  item: one(items, {
    fields: [routings.itemId],
    references: [items.id],
  }),
  creator: one(users, {
    fields: [routings.createdBy],
    references: [users.id],
  }),
  operations: many(routingOperations),
}));
