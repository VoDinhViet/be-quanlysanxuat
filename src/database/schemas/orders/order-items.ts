import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { orders } from './orders';
import { products } from '../products/products';

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
