import { relations, sql } from 'drizzle-orm';
import {
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clients } from '../clients/clients';
import { orderAttachments } from './order-attachments';
import { orderItems } from './order-items';
import {
  PaymentTerm,
  paymentTermEnum,
} from '../suppliers/supplier-payment-info';
import { users } from '../identity-access/users';

/**
 * DRAFT is back (re-added 2026-07-29, reversing the 2026-07-27 "no DRAFT" decision): an order now
 * starts as DRAFT and needs director-level approval before production planning can see it.
 *
 * Rules:
 * - `AWAITING_PRODUCTION` and `REJECTED` are reachable only via `OrdersService.approveOrder`/
 *   `rejectOrder`, never a plain create/update `status` field (`ensureStatusSettable`, `E075`).
 * - Editing a `REJECTED` order without sending `status` reverts it to `DRAFT`
 *   (`OrdersService.updateOrder`), keeping `rejectedBy`/`rejectedAt`/`rejectionReason` as history.
 *
 * See `OrdersService.ensureOrderEditable` for what stays editable.
 */
export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  REJECTED = 'REJECTED',
  AWAITING_PRODUCTION = 'AWAITING_PRODUCTION',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const orderStatusEnum = pgEnum('order_status', [
  OrderStatus.DRAFT,
  OrderStatus.PENDING_CONFIRMATION,
  OrderStatus.REJECTED,
  OrderStatus.AWAITING_PRODUCTION,
  OrderStatus.IN_PROGRESS,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
]);

// Re-exported so callers can `import { PaymentTerm } from '../../database/schemas'` without
// caring that the enum's canonical home is `suppliers/supplier-payment-info.ts` — `orders` reuses
// it as-is rather than declaring a second, identical enum.
export { PaymentTerm };

export enum Currency {
  VND = 'VND',
  USD = 'USD',
  EUR = 'EUR',
  JPY = 'JPY',
  CNY = 'CNY',
  KRW = 'KRW',
}

export const currencyEnum = pgEnum('currency', [
  Currency.VND,
  Currency.USD,
  Currency.EUR,
  Currency.JPY,
  Currency.CNY,
  Currency.KRW,
]);

export enum OrderDiscountType {
  PERCENT = 'PERCENT',
  AMOUNT = 'AMOUNT',
}

export const orderDiscountTypeEnum = pgEnum('order_discount_type', [
  OrderDiscountType.PERCENT,
  OrderDiscountType.AMOUNT,
]);

/**
 * Sales orders ("Đơn hàng").
 *
 * Rules:
 * - Every money column (`subtotal`, `discountAmount`, `vatAmount`, `total`) is server-computed
 *   from `order_items` + the discount/VAT/shipping inputs below — see
 *   `OrdersService.recalculateTotals`. Never write them directly from a request DTO.
 * - "Trễ hạn" (overdue) is intentionally not a column — derived at read time from `dueDate` vs
 *   "now" + `status`, see `OrdersService`.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    // Nullable temporarily — see `CreateOrderReqDto.clientId`.
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'restrict',
    }),
    // Nhân viên kinh doanh phụ trách đơn — vai trò tổ chức, khác `createdBy` (ai bấm nút tạo đơn),
    // nhưng từ khi mọi FK audit đều trỏ `users.id`, hai loại không còn khác nhau về bảng đích nữa.
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    orderDate: date('order_date', { mode: 'date' }).notNull(),
    dueDate: date('due_date', { mode: 'date' }),
    // Người nhận hàng thật — có thể khác khách hàng đặt đơn (giao qua đại lý/đối tác).
    consigneeAddress: varchar('consignee_address', { length: 500 }),
    paymentTerm: paymentTermEnum('payment_term'),
    currency: currencyEnum('currency').notNull().default(Currency.VND),
    exchangeRate: numeric('exchange_rate', {
      precision: 18,
      scale: 6,
      mode: 'number',
    })
      .notNull()
      .default(1),
    status: orderStatusEnum('status').notNull().default(OrderStatus.DRAFT),
    // Approval/rejection — only the most recent event is kept (no history table).
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    rejectedBy: uuid('rejected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: varchar('rejection_reason', { length: 1000 }),
    // Tổng tiền hàng — sum of non-CANCELLED order_items.lineTotal.
    subtotal: numeric('subtotal', { precision: 18, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    discountType: orderDiscountTypeEnum('discount_type')
      .notNull()
      .default(OrderDiscountType.PERCENT),
    discountValue: numeric('discount_value', {
      precision: 18,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    discountAmount: numeric('discount_amount', {
      precision: 18,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    vatPercent: numeric('vat_percent', {
      precision: 5,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    vatAmount: numeric('vat_amount', {
      precision: 18,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    shippingFee: numeric('shipping_fee', {
      precision: 18,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    // TỔNG THANH TOÁN — subtotal - discountAmount + vatAmount + shippingFee.
    total: numeric('total', { precision: 18, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    note: varchar('note', { length: 1000 }),
    internalNote: varchar('internal_note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_orders_client_id').on(table.clientId),
    index('idx_orders_assigned_user_id').on(table.assignedUserId),
    index('idx_orders_created_by').on(table.createdBy),
    index('idx_orders_status')
      .on(table.status)
      .where(sql`deleted_at IS NULL`),
  ],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  client: one(clients, {
    fields: [orders.clientId],
    references: [clients.id],
  }),
  assignedUser: one(users, {
    fields: [orders.assignedUserId],
    references: [users.id],
  }),
  creatorBy: one(users, {
    fields: [orders.createdBy],
    references: [users.id],
  }),
  approverBy: one(users, {
    fields: [orders.approvedBy],
    references: [users.id],
  }),
  rejecterBy: one(users, {
    fields: [orders.rejectedBy],
    references: [users.id],
  }),
  items: many(orderItems),
  attachments: many(orderAttachments),
}));

export type OrderSelect = typeof orders.$inferSelect;
