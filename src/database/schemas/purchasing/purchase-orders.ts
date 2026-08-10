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

import { suppliers } from '../suppliers/suppliers';
import { purchaseOrderItems } from './purchase-order-items';
import { users } from '../identity-access/users';

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  ORDERED = 'ORDERED',
  CANCELLED = 'CANCELLED',
}

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.ORDERED,
  PurchaseOrderStatus.CANCELLED,
]);

/**
 * Đơn mua (PO) — đặt mua với **một** NCC cho một nhóm dòng đề xuất mua hàng đã duyệt
 * (`docs/domains/purchasing.md`). Chỉ 3 trạng thái lưu cột; "Đang nhận"/"Hoàn tất" ở sổ cái tính
 * lúc đọc từ phiếu nhập nối qua `purchase_order_items`, không lưu ở đây.
 */
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    status: purchaseOrderStatusEnum('status')
      .notNull()
      .default(PurchaseOrderStatus.DRAFT),
    orderDate: date('order_date', { mode: 'date' }).notNull(),
    expectedDate: date('expected_date', { mode: 'date' }),
    note: varchar('note', { length: 1000 }),
    orderedBy: uuid('ordered_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    orderedAt: timestamp('ordered_at'),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at'),
    cancellationReason: varchar('cancellation_reason', { length: 1000 }),
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
    index('idx_purchase_orders_supplier_id').on(table.supplierId),
    index('idx_purchase_orders_status').on(table.status),
    index('idx_purchase_orders_created_by').on(table.createdBy),
  ],
);

export const purchaseOrdersRelations = relations(
  purchaseOrders,
  ({ one, many }) => ({
    supplier: one(suppliers, {
      fields: [purchaseOrders.supplierId],
      references: [suppliers.id],
    }),
    ordererBy: one(users, {
      fields: [purchaseOrders.orderedBy],
      references: [users.id],
    }),
    cancellerBy: one(users, {
      fields: [purchaseOrders.cancelledBy],
      references: [users.id],
    }),
    creatorBy: one(users, {
      fields: [purchaseOrders.createdBy],
      references: [users.id],
    }),
    items: many(purchaseOrderItems),
  }),
);
