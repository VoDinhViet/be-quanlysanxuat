import { relations } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { productionOrders } from './production-orders';
import { users } from '../identity-access/users';

export enum ProductionOrderLogAction {
  CREATED = 'CREATED',
  QUANTITY_UPDATED = 'QUANTITY_UPDATED',
  APPROVED = 'APPROVED',
  NOTE_UPDATED = 'NOTE_UPDATED',
  SIGNED_FILE_UPDATED = 'SIGNED_FILE_UPDATED',
  COMPLETED = 'COMPLETED',
}

export const productionOrderLogActionEnum = pgEnum(
  'production_order_log_action',
  [
    ProductionOrderLogAction.CREATED,
    ProductionOrderLogAction.QUANTITY_UPDATED,
    ProductionOrderLogAction.APPROVED,
    ProductionOrderLogAction.NOTE_UPDATED,
    ProductionOrderLogAction.SIGNED_FILE_UPDATED,
    ProductionOrderLogAction.COMPLETED,
  ],
);

/**
 * Lịch sử thao tác trên một LSX, append-only (không `updatedAt`). `content` là câu tiếng Việt
 * sinh sẵn lúc ghi, không tính lại lúc đọc.
 *
 * Rules:
 * - Ghi trong cùng transaction với hành động đang log; không có route ghi log trực tiếp.
 *   `ProductionOrdersService.logAction` (private) ghi `CREATED` (`seedPlan`), `QUANTITY_UPDATED`,
 *   `APPROVED`/`COMPLETED` (`approveProductionOrder`; `COMPLETED` khi mọi dòng SL 0),
 *   `SIGNED_FILE_UPDATED` và `NOTE_UPDATED`.
 * - Hai nơi `tx.insert` thẳng: `NcrsService.createProductionOrder` (`CREATED` cho LSX phụ) và
 *   `InventoryReceiptsService.closeJobIfFullyReceived` (`COMPLETED` khi Job cuối nhận đủ hàng).
 * - `onDelete: 'cascade'`: LSX `PENDING` bị xoá để `seedPlan` ghi đè hoặc khi huỷ SO thì log đi
 *   theo, cùng hành vi với `production_order_items`.
 */
export const productionOrderLogs = pgTable(
  'production_order_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),
    action: productionOrderLogActionEnum('action').notNull(),
    content: varchar('content', { length: 1000 }).notNull(),
    performedBy: uuid('performed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_production_order_logs_production_order_id').on(
      table.productionOrderId,
    ),
    index('idx_production_order_logs_performed_by').on(table.performedBy),
  ],
);

export const productionOrderLogsRelations = relations(
  productionOrderLogs,
  ({ one }) => ({
    productionOrder: one(productionOrders, {
      fields: [productionOrderLogs.productionOrderId],
      references: [productionOrders.id],
    }),
    performerBy: one(users, {
      fields: [productionOrderLogs.performedBy],
      references: [users.id],
    }),
  }),
);

export type ProductionOrderLogSelect = typeof productionOrderLogs.$inferSelect;
