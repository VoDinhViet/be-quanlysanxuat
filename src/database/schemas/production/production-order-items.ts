import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { orderItems } from '../orders/order-items';
import { items } from '../items/items';
import { productionOrders } from './production-orders';

/**
 * Phần con "quyết định sản xuất" của một LSX — 1 dòng cho mỗi dòng PO (`order_items`) status
 * NORMAL, mang Đề xuất SX + snapshot tồn tại lần ghi gần nhất. Giữ 1-1 với `orderItemId` (không
 * gộp theo sản phẩm ở tầng này) vì phiếu xuất kho cần `orderItemId` để delivery tracking (xem
 * `docs/domains/inventory.md`) — gộp theo sản phẩm chỉ xảy ra ở tầng `production_jobs`.
 *
 * `orderItemId` dùng `restrict`, không `cascade` — `OrdersService.updateOrder` tự xoá các dòng
 * của LSX chưa phát hành trước khi replace `order_items` (transaction theo
 * `.claude/rules/service.md`), thay vì trông cậy FK tự dọn.
 */
export const productionOrderItems = pgTable(
  'production_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .unique()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    // Đề xuất SX đã chốt (do hệ thống gợi ý hoặc người dùng sửa tay).
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    // Snapshot số liệu người dùng nhìn thấy tại lần ghi gần nhất của dòng này.
    orderQty: numeric('order_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    onHandQty: numeric('on_hand_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    // Có thể âm — "Khả dụng" là onHand trừ nhu cầu reserved của mọi đơn đang mở khác.
    availableQty: numeric('available_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    fromStockQty: numeric('from_stock_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_production_order_items_production_order_id').on(
      table.productionOrderId,
    ),
    index('idx_production_order_items_item_id').on(table.itemId),
    check('chk_production_order_items_quantity', sql`quantity >= 0`),
  ],
);

export const productionOrderItemsRelations = relations(
  productionOrderItems,
  ({ one }) => ({
    productionOrder: one(productionOrders, {
      fields: [productionOrderItems.productionOrderId],
      references: [productionOrders.id],
    }),
    orderItem: one(orderItems, {
      fields: [productionOrderItems.orderItemId],
      references: [orderItems.id],
    }),
    item: one(items, {
      fields: [productionOrderItems.itemId],
      references: [items.id],
    }),
  }),
);

export type ProductionOrderItemSelect =
  typeof productionOrderItems.$inferSelect;
