import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clients } from './clients';
import { files } from './files';
import { products } from './products';
import { PaymentTerm, paymentTermEnum } from './suppliers';
import { users } from './users';

/**
 * DRAFT is back (re-added 2026-07-29, reversing the 2026-07-27 "no DRAFT" decision): an order now
 * starts as DRAFT and needs director-level approval before production planning can see it.
 *
 * Rules:
 * - `AWAITING_PRODUCTION` is reachable only via `OrdersService.approveOrder`, never a plain
 *   create/update `status` field (`OrdersService.ensureStatusSettable`, `E075`).
 * - Every other transition — DRAFT → PENDING_CONFIRMATION, and everything from
 *   AWAITING_PRODUCTION onward — stays as loose as the rest of `orders`, no full state machine.
 *
 * See `OrdersService.ensureOrderEditable` for what stays editable.
 */
export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  AWAITING_PRODUCTION = 'AWAITING_PRODUCTION',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const orderStatusEnum = pgEnum('order_status', [
  OrderStatus.DRAFT,
  OrderStatus.PENDING_CONFIRMATION,
  OrderStatus.AWAITING_PRODUCTION,
  OrderStatus.IN_PROGRESS,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
]);

// Re-exported so callers can `import { PaymentTerm } from '../../database/schemas'` without
// caring that the enum's canonical home is `suppliers.ts` — `orders` reuses it as-is rather than
// declaring a second, identical enum.
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

/** "Bình thường" / "Đã hủy" on a single order line — a cancelled line is excluded from `subtotal`. */
export enum OrderItemStatus {
  NORMAL = 'NORMAL',
  CANCELLED = 'CANCELLED',
}

export const orderItemStatusEnum = pgEnum('order_item_status', [
  OrderItemStatus.NORMAL,
  OrderItemStatus.CANCELLED,
]);

/**
 * Sales orders ("Đơn hàng").
 *
 * Rules:
 * - Every money column (`subtotal`, `discountAmount`, `vatAmount`, `total`) is server-computed
 *   from `order_items` + the discount/VAT/shipping inputs below — see
 *   `OrdersService.recalculateTotals`. Never write them directly from a request DTO.
 * - `contactName`/`contactPhone`/`contactEmail` are a snapshot of a `client_contacts` row at
 *   create time, not a foreign key — `ClientsService.replaceContacts` deletes and re-inserts a
 *   client's contacts on every client update, so a contact id has no stable identity to point at.
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
    contactName: varchar('contact_name', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 30 }),
    contactEmail: varchar('contact_email', { length: 255 }),
    // Nhân viên kinh doanh phụ trách đơn — vai trò tổ chức, khác `createdBy` (ai bấm nút tạo đơn),
    // nhưng từ khi mọi FK audit đều trỏ `users.id`, hai loại không còn khác nhau về bảng đích nữa.
    staffId: uuid('staff_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    orderDate: date('order_date', { mode: 'date' }).notNull(),
    dueDate: date('due_date', { mode: 'date' }),
    deliveryAddress: varchar('delivery_address', { length: 500 }),
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
    index('idx_orders_staff_id').on(table.staffId),
    index('idx_orders_created_by').on(table.createdBy),
    index('idx_orders_status')
      .on(table.status)
      .where(sql`deleted_at IS NULL`),
  ],
);

/**
 * One line of an order.
 *
 * Rules:
 * - `lineTotal` is server-computed (see `orders` doc comment) — written by
 *   `OrdersService.recalculateTotals`, never by the request DTO.
 * - Product name/image/unit are read through the `product` relation, not snapshotted:
 *   `products` is soft-deleted and referenced here with `onDelete: 'restrict'`, so a line's
 *   product row always exists to join against.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    unitPrice: numeric('unit_price', {
      precision: 18,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    discountPercent: numeric('discount_percent', {
      precision: 5,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    lineTotal: numeric('line_total', {
      precision: 18,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    note: varchar('note', { length: 500 }),
    status: orderItemStatusEnum('status')
      .notNull()
      .default(OrderItemStatus.NORMAL),
    // STT — sibling order for drag-and-drop reordering on the UI; client-assigned, never
    // renumbered by the service.
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_order_items_order_id').on(table.orderId),
    index('idx_order_items_product_id').on(table.productId),
    check('chk_order_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_order_items_discount_percent_range',
      sql`discount_percent >= 0 AND discount_percent <= 100`,
    ),
  ],
);

/**
 * 1-many with orders: the "tài liệu đính kèm" panel. Each row is a link to a `files` registry
 * row, never a bare URL. Replace-all on update — same shape as `product_attachments`.
 */
export const orderAttachments = pgTable(
  'order_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_order_attachments_order_id').on(table.orderId),
    index('idx_order_attachments_file_id').on(table.fileId),
  ],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  client: one(clients, {
    fields: [orders.clientId],
    references: [clients.id],
  }),
  staff: one(users, {
    fields: [orders.staffId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [orders.createdBy],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [orders.approvedBy],
    references: [users.id],
  }),
  rejecter: one(users, {
    fields: [orders.rejectedBy],
    references: [users.id],
  }),
  items: many(orderItems),
  attachments: many(orderAttachments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const orderAttachmentsRelations = relations(
  orderAttachments,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderAttachments.orderId],
      references: [orders.id],
    }),
    file: one(files, {
      fields: [orderAttachments.fileId],
      references: [files.id],
    }),
  }),
);
