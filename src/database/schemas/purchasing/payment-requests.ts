import { relations, sql } from 'drizzle-orm';
import {
  boolean,
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

// PH-134: DRAFT (người mua rà soát) → PENDING (đã đề nghị, chờ kế toán) → PAID; kế toán có thể trả về
// REJECTED để người mua sửa rồi đề nghị lại; DRAFT/PENDING/REJECTED đều hủy được.
export enum PaymentRequestStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export const paymentRequestStatusEnum = pgEnum('payment_request_status', [
  PaymentRequestStatus.DRAFT,
  PaymentRequestStatus.PENDING,
  PaymentRequestStatus.REJECTED,
  PaymentRequestStatus.PAID,
  PaymentRequestStatus.CANCELLED,
]);

/**
 * Yêu cầu thanh toán — bảng phẳng, 1 dòng = đúng 1 PO (`purchaseOrderId` unique), không có bảng
 * con item — dòng vật tư ở chi tiết đọc lại từ `purchase_order_items` của PO đó, không lưu trùng.
 * Tự sinh khi PO đạt tiến độ COMPLETED (`PaymentRequestsService.createIfOrderCompleted`, gọi từ
 * `InventoryReceiptsService.postInventoryReceipt`) — không có route tạo tay
 * (`docs/domains/purchasing.md`, `docs/decisions/purchasing-scope-limits.md`).
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
    // Số đề nghị chi = tổng tiền PO (tiền hàng + VAT + chi phí khác) − tạm ứng, chốt lúc tạo — an toàn vì PO đã ORDERED nên items bất biến
    // (PATCH chỉ cho phép khi DRAFT), không phải lựa chọn thẩm mỹ.
    requestedAmount: numeric('request_value', {
      precision: 18,
      scale: 2,
      mode: 'number',
    }).notNull(),
    // Snapshot tiền tạm ứng của PO lúc sinh/cập nhật — `requestedAmount` đã là phần còn lại phải trả
    // (tổng tiền PO − tạm ứng), cột này chỉ để hiển thị cách ra số.
    advancePaymentAmount: numeric('advance_payment_amount', {
      precision: 18,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    // Chi phí phát sinh sau khi đặt hàng (giao hàng ngoài giờ, bốc dỡ, lưu bãi...); mặc định 0.
    extraCost: numeric('extra_cost', {
      precision: 18,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    extraCostNote: varchar('extra_cost_note', { length: 1000 }),
    dueDate: date('due_date', { mode: 'date' }).notNull(),
    status: paymentRequestStatusEnum('status')
      .notNull()
      .default(PaymentRequestStatus.DRAFT),
    sentBy: uuid('sent_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sentAt: timestamp('sent_at'),
    // Lý do từ chối giữ lại làm lịch sử sau khi đề nghị lại; chỉ hiển thị khi đang REJECTED.
    rejectedBy: uuid('rejected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: varchar('rejection_reason', { length: 1000 }),
    paidBy: uuid('paid_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    paidAt: timestamp('paid_at'),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at'),
    cancellationReason: varchar('cancellation_reason', { length: 1000 }),
    // Số hóa đơn của NCC do người dùng tự nhập (PH-130), để đối chiếu/truy xuất hóa đơn.
    supplierInvoiceNo: varchar('supplier_invoice_no', { length: 100 }),
    note: varchar('note', { length: 1000 }),
    // Đánh dấu YCTT gấp (PH-133) để kế toán ưu tiên thanh toán trước; mặc định bình thường.
    isUrgent: boolean('is_urgent').notNull().default(false),
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
    index('idx_payment_requests_sent_by').on(table.sentBy),
    index('idx_payment_requests_rejected_by').on(table.rejectedBy),
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
    sentByUser: one(users, {
      fields: [paymentRequests.sentBy],
      references: [users.id],
    }),
    rejectedByUser: one(users, {
      fields: [paymentRequests.rejectedBy],
      references: [users.id],
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
