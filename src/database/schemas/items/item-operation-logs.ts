import { relations } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { bomItems } from './bom-items';
import { items } from './items';
import { operations } from '../operations';
import { users } from '../identity-access/users';

/** `DELETED_WITH_PART` tách khỏi `DELETED` vì công đoạn mất theo Part (cascade), không phải do
 * người dùng bấm xoá chính nó. */
export enum ItemOperationLogAction {
  CREATED = 'CREATED',
  COPIED = 'COPIED',
  UPDATED = 'UPDATED',
  DELETED = 'DELETED',
  DELETED_WITH_PART = 'DELETED_WITH_PART',
}

export const itemOperationLogActionEnum = pgEnum('item_operation_log_action', [
  ItemOperationLogAction.CREATED,
  ItemOperationLogAction.COPIED,
  ItemOperationLogAction.UPDATED,
  ItemOperationLogAction.DELETED,
  ItemOperationLogAction.DELETED_WITH_PART,
]);

/** `ROUTING` là công đoạn Cấp 0 (`routing_operations`), `PART` là công đoạn của Part (`bom_operations`). */
export enum ItemOperationStepLevel {
  ROUTING = 'ROUTING',
  PART = 'PART',
}

export const itemOperationStepLevelEnum = pgEnum('item_operation_step_level', [
  ItemOperationStepLevel.ROUTING,
  ItemOperationStepLevel.PART,
]);

/**
 * Lịch sử công đoạn của một sản phẩm (Cấp 0 lẫn Part) — cùng khuôn `production_job_logs`,
 * append-only (không `updatedAt`), ghi bằng `tx.insert` thẳng trong transaction của thao tác; dòng
 * log dựng ở `buildItemOperationLog`.
 *
 * Rules:
 * - Bổ sung cho xoá mềm: `deletedAt`/`deletedBy` chỉ giữ lần xoá, còn đây giữ cả thêm, sao chép, sửa.
 * - Các cột phân loại để lọc theo công đoạn hoặc Part mà không phải dò trong `content`.
 * - `stepId` không có FK vì trỏ tới một trong hai bảng, tuỳ `stepLevel`.
 * - `content` là `text` vì chứa nguyên ghi chú trước và sau khi sửa, mỗi ghi chú tới 1000 ký tự.
 */
export const itemOperationLogs = pgTable(
  'item_operation_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    action: itemOperationLogActionEnum('action').notNull(),
    stepLevel: itemOperationStepLevelEnum('step_level').notNull(),
    stepId: uuid('step_id').notNull(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'restrict' }),
    bomItemId: uuid('bom_item_id').references(() => bomItems.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    performedBy: uuid('performed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_item_operation_logs_item_id').on(table.itemId),
    index('idx_item_operation_logs_step_id').on(table.stepId),
    index('idx_item_operation_logs_operation_id').on(table.operationId),
    index('idx_item_operation_logs_bom_item_id').on(table.bomItemId),
    index('idx_item_operation_logs_performed_by').on(table.performedBy),
  ],
);

export const itemOperationLogsRelations = relations(
  itemOperationLogs,
  ({ one }) => ({
    item: one(items, {
      fields: [itemOperationLogs.itemId],
      references: [items.id],
    }),
    operation: one(operations, {
      fields: [itemOperationLogs.operationId],
      references: [operations.id],
    }),
    bomItem: one(bomItems, {
      fields: [itemOperationLogs.bomItemId],
      references: [bomItems.id],
    }),
    performerBy: one(users, {
      fields: [itemOperationLogs.performedBy],
      references: [users.id],
    }),
  }),
);

export type ItemOperationLogSelect = typeof itemOperationLogs.$inferSelect;
