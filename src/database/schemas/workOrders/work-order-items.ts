import { relations } from 'drizzle-orm';
import { numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { orderItems } from '../orders';
import { products } from '../products';
import { workOrders } from './work-orders';

export const workOrderItems = pgTable('work_order_items', {
  // ID dòng LSX.
  id: uuid('id').defaultRandom().primaryKey(),
  // LSX.
  workOrderId: uuid('work_order_id')
    .notNull()
    .references(() => workOrders.id, { onDelete: 'cascade' }),
  // Dòng PO.
  orderItemId: uuid('order_item_id')
    .notNull()
    .references(() => orderItems.id, { onDelete: 'restrict' }),
  // Thành phẩm.
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // SL PO.
  poQuantity: numeric('po_quantity', { precision: 18, scale: 3 }).notNull(),
  // Tồn TP đã kiểm tra.
  finishedGoodsStock: numeric('finished_goods_stock', { precision: 18, scale: 3 })
    .notNull()
    .default('0'),
  // Khả dụng.
  availableQuantity: numeric('available_quantity', { precision: 18, scale: 3 })
    .notNull()
    .default('0'),
  // Đề xuất SX hệ thống.
  suggestedProductionQuantity: numeric('suggested_production_quantity', { precision: 18, scale: 3 })
    .notNull()
    .default('0'),
  // Đề xuất SX đã chỉnh.
  productionQuantity: numeric('production_quantity', { precision: 18, scale: 3 })
    .notNull()
    .default('0'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const workOrderItemsRelations = relations(workOrderItems, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [workOrderItems.workOrderId],
    references: [workOrders.id],
  }),
  orderItem: one(orderItems, {
    fields: [workOrderItems.orderItemId],
    references: [orderItems.id],
  }),
  product: one(products, {
    fields: [workOrderItems.productId],
    references: [products.id],
  }),
}));

export type WorkOrderItem = typeof workOrderItems.$inferSelect;
export type NewWorkOrderItem = typeof workOrderItems.$inferInsert;
