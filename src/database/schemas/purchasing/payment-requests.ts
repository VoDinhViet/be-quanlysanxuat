import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from '../identity-access/users';
import { purchaseOrders } from './purchase-orders';

export enum PaymentRequestStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export const paymentRequestStatusEnum = pgEnum('payment_request_status', [
  PaymentRequestStatus.PENDING,
  PaymentRequestStatus.PAID,
  PaymentRequestStatus.CANCELLED,
]);

/**
 * Yêu cầu thanh toán — bảng phẳng, 1 dòng = đúng 1 PO (`purchaseOrderId` unique), không có bảng
 * con item — dòng vật tư ở chi tiết đọc lại từ `purchase_order_items` của PO đó, không lưu trùng.
 * Tự sinh khi PO đạt tiến độ COMPLETED (`PaymentRequestsService.createIfOrderCompleted`, gọi từ
 * `InventoryReceiptsService.postInventoryReceipt`) — không có route tạo tay
 * (`docs/domains/purchasing.md`, `docs/decisions/no-procurement.md`).
 */
export const paymentRequests = pgTable(
  'payment_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .unique()
      .references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    // Snapshot Σ quantity*unitPrice của PO lúc tạo — an toàn vì PO đã ORDERED nên items bất biến
    // (PATCH chỉ cho phép khi DRAFT), không phải lựa chọn thẩm mỹ.
    requestValue: numeric('request_value', {
      precision: 18,
      scale: 2,
      mode: 'number',
    }).notNull(),
    dueDate: date('due_date', { mode: 'date' }).notNull(),
    status: paymentRequestStatusEnum('status')
      .notNull()
      .default(PaymentRequestStatus.PENDING),
    paidBy: uuid('paid_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    paidAt: timestamp('paid_at'),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at'),
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
    index('idx_payment_requests_status').on(table.status),
    index('idx_payment_requests_created_by').on(table.createdBy),
    index('idx_payment_requests_paid_by').on(table.paidBy),
    index('idx_payment_requests_cancelled_by').on(table.cancelledBy),
    check(
      'chk_payment_requests_request_value_non_negative',
      sql`request_value >= 0`,
    ),
  ],
);

export const paymentRequestsRelations = relations(
  paymentRequests,
  ({ one }) => ({
    purchaseOrder: one(purchaseOrders, {
      fields: [paymentRequests.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    paidByUser: one(users, {
      fields: [paymentRequests.paidBy],
      references: [users.id],
    }),
    cancelledByUser: one(users, {
      fields: [paymentRequests.cancelledBy],
      references: [users.id],
    }),
    creatorBy: one(users, {
      fields: [paymentRequests.createdBy],
      references: [users.id],
    }),
  }),
);

export type PaymentRequestSelect = typeof paymentRequests.$inferSelect;
