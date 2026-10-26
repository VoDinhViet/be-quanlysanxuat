import { relations } from 'drizzle-orm';
import {
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { outsourcingOrderItems } from './outsourcing-order-items';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

/**
 * Vừa là trạng thái chứng từ vừa là tiến độ nhận hàng, không tách cột `progress` riêng.
 *
 * Rules:
 * - Phiếu đi `DRAFT` → `PENDING_APPROVAL` → `APPROVED` (hoặc `REJECTED`, sửa rồi gửi lại) → `SENT`
 *   khi xác nhận xuất gia công. Hàng chỉ coi là đã rời xưởng từ `SENT`.
 * - `PARTIAL`/`WAITING_QC`/`COMPLETED` chỉ do `recomputeOutsourcingOrderStatus`
 *   (`outsourcing-orders.query.ts`) ghi, gọi mỗi khi SL đã nhận hoặc IQC đổi; không route nào ghi tay.
 * - `CANCELLED` chỉ do `cancelOutsourcingOrder` ghi và `recompute` không ghi đè lại.
 */
export enum OutsourcingOrderStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SENT = 'SENT',
  PARTIAL = 'PARTIAL',
  WAITING_QC = 'WAITING_QC',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const outsourcingOrderStatusEnum = pgEnum('outsourcing_order_status', [
  OutsourcingOrderStatus.DRAFT,
  OutsourcingOrderStatus.PENDING_APPROVAL,
  OutsourcingOrderStatus.APPROVED,
  OutsourcingOrderStatus.REJECTED,
  OutsourcingOrderStatus.SENT,
  OutsourcingOrderStatus.PARTIAL,
  OutsourcingOrderStatus.WAITING_QC,
  OutsourcingOrderStatus.COMPLETED,
  OutsourcingOrderStatus.CANCELLED,
]);

/**
 * Nguồn gốc phiếu: `FROM_JOB` chọn từ công đoạn của Job (có kiểm định mức), `MANUAL` người dùng tự
 * nhập mã/tên/SL và chọn một công đoạn gia công ngoài từ danh mục (không gắn Job, không kiểm định
 * mức).
 */
export enum OutsourcingOrderOrigin {
  FROM_JOB = 'FROM_JOB',
  MANUAL = 'MANUAL',
}

export const outsourcingOrderOriginEnum = pgEnum('outsourcing_order_origin', [
  OutsourcingOrderOrigin.FROM_JOB,
  OutsourcingOrderOrigin.MANUAL,
]);

/** Phiếu gửi gia công ngoài (OS-OUT) — header, nhiều dòng ở `outsourcing_order_items`. */
export const outsourcingOrders = pgTable(
  'outsourcing_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    sendDate: date('send_date', { mode: 'date' }).notNull(),
    expectedReturnDate: date('expected_return_date', { mode: 'date' }),
    origin: outsourcingOrderOriginEnum('origin')
      .notNull()
      .default(OutsourcingOrderOrigin.FROM_JOB),
    status: outsourcingOrderStatusEnum('status')
      .notNull()
      .default(OutsourcingOrderStatus.DRAFT),
    note: varchar('note', { length: 1000 }),
    submittedBy: uuid('submitted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at'),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    rejectedBy: uuid('rejected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: varchar('rejection_reason', { length: 1000 }),
    postedBy: uuid('posted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    postedAt: timestamp('posted_at'),
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
    index('idx_outsourcing_orders_supplier_id').on(table.supplierId),
    index('idx_outsourcing_orders_status').on(table.status),
    index('idx_outsourcing_orders_send_date').on(table.sendDate),
    index('idx_outsourcing_orders_created_by').on(table.createdBy),
    index('idx_outsourcing_orders_posted_by').on(table.postedBy),
  ],
);

export const outsourcingOrdersRelations = relations(
  outsourcingOrders,
  ({ one, many }) => ({
    supplier: one(suppliers, {
      fields: [outsourcingOrders.supplierId],
      references: [suppliers.id],
    }),
    creatorBy: one(users, {
      fields: [outsourcingOrders.createdBy],
      references: [users.id],
    }),
    posterBy: one(users, {
      fields: [outsourcingOrders.postedBy],
      references: [users.id],
    }),
    approverBy: one(users, {
      fields: [outsourcingOrders.approvedBy],
      references: [users.id],
    }),
    rejecterBy: one(users, {
      fields: [outsourcingOrders.rejectedBy],
      references: [users.id],
    }),
    items: many(outsourcingOrderItems),
  }),
);

export type OutsourcingOrderSelect = typeof outsourcingOrders.$inferSelect;
