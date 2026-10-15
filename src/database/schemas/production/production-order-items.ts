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
 * Dòng "quyết định sản xuất" của một LSX thường — 1 dòng cho mỗi dòng SO (`order_items`) status
 * `NORMAL`, mang Đề xuất SX và snapshot tồn ở lần ghi gần nhất. Giữ 1-1 với `orderItemId` (không
 * gộp theo sản phẩm) vì phiếu xuất kho cần `orderItemId` để theo dõi giao hàng (xem
 * `docs/CODEMAPS/sales.md`); chỉ `production_jobs` mới gộp theo sản phẩm.
 *
 * `orderItemId` dùng `restrict`, không `cascade`: sửa `items` của SO bị chặn khi đã có LSX
 * (`E080`), còn huỷ SO thì `OrdersService.updateOrder` xoá LSX `PENDING` tường minh trong
 * transaction thay vì trông vào FK tự dọn.
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
