import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { boms } from './boms';
import { operations, OperationType, operationTypeEnum } from '../operations';
import { users } from '../identity-access/users';

/**
 * Công đoạn as-used của Cấp 0 (chính sản phẩm gốc, không phải một node `bom_items`) — gắn thẳng
 * vào `boms.id`, tách khỏi `bom_operations` (node COMPONENT) vì Cấp 0 không phải một node
 * (`docs/decisions/routing-operations-table.md`).
 *
 * Rules: cùng `bom_operations` — `operationId` bất biến sau khi thêm (đổi = xoá + thêm lại);
 * không unique trên `(bomId, operationId)` (một chuỗi được lặp lại cùng công đoạn); `type` là
 * quyết định thật cho bước này, độc lập với `operations.type` danh mục
 * (`docs/decisions/routing-operation-type-per-attachment.md`).
 */
export const routingOperations = pgTable(
  'routing_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),
    // restrict: một công đoạn đang được routing tham chiếu không thể bị xoá cứng ra khỏi dưới chân
    // nó — `operations` tự soft-delete được, không cần hard-delete.
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'restrict' }),
    type: operationTypeEnum('type').notNull().default(OperationType.INHOUSE),
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
    index('idx_routing_operations_bom_id').on(table.bomId),
    index('idx_routing_operations_operation_id').on(table.operationId),
    index('idx_routing_operations_created_by').on(table.createdBy),
  ],
);

export const routingOperationsRelations = relations(
  routingOperations,
  ({ one }) => ({
    bom: one(boms, {
      fields: [routingOperations.bomId],
      references: [boms.id],
    }),
    operation: one(operations, {
      fields: [routingOperations.operationId],
      references: [operations.id],
    }),
    creatorBy: one(users, {
      fields: [routingOperations.createdBy],
      references: [users.id],
    }),
  }),
);

export type RoutingOperationSelect = typeof routingOperations.$inferSelect;
