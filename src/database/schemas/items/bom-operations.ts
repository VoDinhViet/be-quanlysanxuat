import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { bomItems } from './bom-items';
import { operations } from '../operations';
import { users } from '../identity-access/users';

/**
 * Công đoạn as-used gắn thẳng vào một node `bom_items` cụ thể (chỉ node WIP — node RM là lá, không
 * gắn được). Cùng khuôn `bom_items`.
 *
 * Rules:
 * - `operationId` bất biến sau khi thêm — đổi công đoạn là xoá dòng rồi thêm lại.
 * - Không unique trên `(bomItemId, operationId)` — một chuỗi được phép lặp lại cùng công đoạn (vd.
 *   Kiểm tra → Gia công → Kiểm tra).
 */
export const bomOperations = pgTable(
  'bom_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bomItemId: uuid('bom_item_id')
      .notNull()
      .references(() => bomItems.id, { onDelete: 'cascade' }),
    // restrict: một công đoạn đang được routing tham chiếu không thể bị xoá cứng ra khỏi dưới chân
    // nó — `operations` tự soft-delete được, không cần hard-delete.
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_bom_operations_bom_item_id').on(table.bomItemId),
    index('idx_bom_operations_operation_id').on(table.operationId),
    index('idx_bom_operations_created_by').on(table.createdBy),
  ],
);

export const bomOperationsRelations = relations(bomOperations, ({ one }) => ({
  bomItem: one(bomItems, {
    fields: [bomOperations.bomItemId],
    references: [bomItems.id],
  }),
  operation: one(operations, {
    fields: [bomOperations.operationId],
    references: [operations.id],
  }),
  creator: one(users, {
    fields: [bomOperations.createdBy],
    references: [users.id],
  }),
}));
