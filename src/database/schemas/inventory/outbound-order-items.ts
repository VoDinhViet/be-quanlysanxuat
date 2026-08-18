import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { outboundOrders } from './outbound-orders';
import { items } from '../items/items';
import { orderItems } from '../orders/order-items';
import { productionJobs } from '../production/production-jobs';

/**
 * Dòng phiếu giao hàng (DO) — mỗi dòng trỏ 1 `order_items` (dòng PO nguồn), **không unique**: một
 * dòng PO được chọn lại ở nhiều phiếu DO khác nhau qua nhiều lần giao (`docs/domains/inventory.md`,
 * mục "Giao hàng"). `itemId` denormalize từ `orderItem.itemId` (khuôn
 * `outsourcing_receipt_items.itemId`); `productionJobId` là snapshot Job hiển thị, suy 1 lần lúc
 * tạo dòng — không dùng để validate.
 */
export const outboundOrderItems = pgTable(
  'outbound_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outboundOrderId: uuid('outbound_order_id')
      .notNull()
      .references(() => outboundOrders.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    // `set null` — Job có thể bị hard-delete khi LSX chứa nó được duyệt lại
    // (`ProductionOrdersService.seedPlan`), cùng lý do `outsourcing_order_items.productionJobId`.
    productionJobId: uuid('production_job_id').references(
      () => productionJobs.id,
      { onDelete: 'set null' },
    ),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    note: varchar('note', { length: 500 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_outbound_order_items_outbound_order_id').on(
      table.outboundOrderId,
    ),
    index('idx_outbound_order_items_order_item_id').on(table.orderItemId),
    index('idx_outbound_order_items_item_id').on(table.itemId),
    index('idx_outbound_order_items_production_job_id').on(
      table.productionJobId,
    ),
    check('chk_outbound_order_items_quantity_positive', sql`quantity > 0`),
  ],
);

export const outboundOrderItemsRelations = relations(
  outboundOrderItems,
  ({ one }) => ({
    outboundOrder: one(outboundOrders, {
      fields: [outboundOrderItems.outboundOrderId],
      references: [outboundOrders.id],
    }),
    orderItem: one(orderItems, {
      fields: [outboundOrderItems.orderItemId],
      references: [orderItems.id],
    }),
    item: one(items, {
      fields: [outboundOrderItems.itemId],
      references: [items.id],
    }),
    productionJob: one(productionJobs, {
      fields: [outboundOrderItems.productionJobId],
      references: [productionJobs.id],
    }),
  }),
);

export type OutboundOrderItemSelect = typeof outboundOrderItems.$inferSelect;
