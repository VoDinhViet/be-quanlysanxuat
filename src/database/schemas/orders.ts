import { relations, sql } from 'drizzle-orm';
import {
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
import { credentials } from './credentials';
import { products } from './products';
import { users } from './users';

export enum OrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const orderStatusEnum = pgEnum('order_status', [
  OrderStatus.DRAFT,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PROGRESS,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
]);

/**
 * Sales orders ("Đơn hàng"). `totalAmount` is a stored, server-computed sum of `order_items.line_total`
 * — never accepted from the client — kept as a column (not derived on every read) so list/stats
 * queries don't need to join+aggregate `order_items`. "Trễ hạn" (overdue) is intentionally NOT a
 * column: it's derived at read time from `deliveryDate` vs "now" + `status`, see `OrdersService`.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    staffId: uuid('staff_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    orderDate: date('order_date', { mode: 'date' }).notNull(),
    deliveryDate: date('delivery_date', { mode: 'date' }),
    paymentTerms: varchar('payment_terms', { length: 100 }),
    status: orderStatusEnum('status').notNull().default(OrderStatus.DRAFT),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0'),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => credentials.id, {
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
 * 1-many with orders: the product lines of a sales order. `lineTotal` is server-computed
 * (`quantity * unitPrice`), never accepted from the client. No soft delete — child of `orders`,
 * replace-all on update (delete all + re-insert), same convention as `client_contacts`.
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
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
    lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull(),
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
  creator: one(credentials, {
    fields: [orders.createdBy],
    references: [credentials.id],
  }),
  items: many(orderItems),
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
