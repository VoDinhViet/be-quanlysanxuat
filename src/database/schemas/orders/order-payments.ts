import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from '../identity-access/users';
import { orders } from './orders';

/** Sổ cái thanh toán của đơn — append-only, cùng khuôn `inventory_transactions`: sai thì ghi thêm
 * 1 dòng `amount` âm để đảo, không sửa/xoá dòng cũ. `paymentStatus` tính lúc đọc từ SUM(amount)
 * so với `orders.total`, không lưu cột — xem `docs/domains/orders.md`. */
export const orderPayments = pgTable(
  'order_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Âm khi là bút toán đảo (huỷ một lần ghi nhận trước đó).
    amount: numeric('amount', {
      precision: 18,
      scale: 2,
      mode: 'number',
    }).notNull(),
    paidAt: date('paid_at', { mode: 'date' }).notNull(),
    note: varchar('note', { length: 500 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_order_payments_order_id').on(table.orderId),
    check('chk_order_payments_amount_nonzero', sql`amount != 0`),
  ],
);

export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
  order: one(orders, {
    fields: [orderPayments.orderId],
    references: [orders.id],
  }),
  creatorBy: one(users, {
    fields: [orderPayments.createdBy],
    references: [users.id],
  }),
}));

export type OrderPaymentSelect = typeof orderPayments.$inferSelect;
