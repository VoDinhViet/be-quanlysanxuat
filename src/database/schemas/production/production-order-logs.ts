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

/** "Hành động" ghi log trên một LSX — mở rộng khi có thêm đường ghi mới trên `productionOrders`
 * (ví dụ huỷ duyệt, khi route đó được làm). */
export enum ProductionOrderLogAction {
  CREATED = 'CREATED',
  QUANTITY_UPDATED = 'QUANTITY_UPDATED',
  APPROVED = 'APPROVED',
  NOTE_UPDATED = 'NOTE_UPDATED',
  COMPLETED = 'COMPLETED',
}

export const productionOrderLogActionEnum = pgEnum(
  'production_order_log_action',
  [
    ProductionOrderLogAction.CREATED,
    ProductionOrderLogAction.QUANTITY_UPDATED,
    ProductionOrderLogAction.APPROVED,
    ProductionOrderLogAction.NOTE_UPDATED,
    ProductionOrderLogAction.COMPLETED,
  ],
);

/**
 * Lịch sử thao tác trên một LSX — thời gian (`createdAt`), người thực hiện (`performedBy`), nội
 * dung (`content`, mô tả sẵn bằng tiếng Việt, sinh tại nơi ghi chứ không tính lại lúc đọc). Append
 * -only, không có `updatedAt` — cùng khuôn `order_files`/`client_contacts`, một dòng log
 * không bao giờ bị `UPDATE`.
 *
 * Rules:
 * - `ProductionOrdersService.logAction` ghi 4 hành động đầu (`seedPlan` → `CREATED`,
 *   `updateProductionOrder` → `QUANTITY_UPDATED`, `approveProductionOrder` → `APPROVED`,
 *   `NOTE_UPDATED`) — luôn trong cùng transaction với hành động đang log. `COMPLETED` là ngoại lệ
 *   duy nhất: ghi thẳng (không qua `logAction`, hàm đó `private`) từ
 *   `InventoryReceiptsService.postInventoryReceipt` khi Job cuối của LSX vừa nhận đủ hàng — xem
 *   `docs/decisions/production-lifecycle-closing.md`. Không có route ghi log trực tiếp.
 * - `onDelete: 'cascade'` từ `productionOrders` — khi header bị xoá để ghi đè (replace-all lúc
 *   `seedPlan`/`OrdersService.updateOrder` xoá LSX `PENDING`), log cũ mất theo, cùng hành vi với
 *   `production_order_items`, không phải rủi ro riêng của bảng này.
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
