import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { materials } from '../materials/materials';
import { orderItems } from '../orders/order-items';
import { products } from '../products/products';
import { stockReceipts } from './stock-receipts';

/**
 * One line of a stock receipt.
 *
 * Rules:
 * - Đúng một trong `productId`/`materialId` được set, khớp `subject` của `stockReceipts` cha —
 *   service-enforced (không phải DB CHECK, vì CHECK không đọc được row cha), xem
 *   `StockReceiptsService.ensureItemsValid`. `chk_stock_receipt_items_target` chỉ đảm bảo
 *   "đúng một trong hai", không đảm bảo khớp đúng `subject`.
 * - `productId` phải là `FINISHED_GOOD` khi có mặt — service-enforced, cùng chỗ ở trên.
 * - `orderItemId` is the only link back to `orders`: on an `OUT`/`DELIVERY` line it records which
 *   PO line this stock left for — both the delivery audit trail `orders` itself doesn't have yet,
 *   and the sole signal `InventoryService.reservedSubquery` uses to know a PO line has been
 *   (partially) fulfilled. Nullable — every other reason (production receipt, stocktake, generic
 *   OUT) leaves it unset. Chỉ hợp lệ trên dòng `productId` (`subject = FINISHED_GOOD`) — service
 *   từ chối nếu gửi trên dòng `materialId`.
 */
export const stockReceiptItems = pgTable(
  'stock_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => stockReceipts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'restrict',
    }),
    materialId: uuid('material_id').references(() => materials.id, {
      onDelete: 'restrict',
    }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_stock_receipt_items_receipt_id').on(table.receiptId),
    index('idx_stock_receipt_items_product_id').on(table.productId),
    index('idx_stock_receipt_items_material_id').on(table.materialId),
    index('idx_stock_receipt_items_order_item_id').on(table.orderItemId),
    check('chk_stock_receipt_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_stock_receipt_items_target',
      sql`(product_id IS NOT NULL AND material_id IS NULL) OR (product_id IS NULL AND material_id IS NOT NULL)`,
    ),
  ],
);

export const stockReceiptItemsRelations = relations(
  stockReceiptItems,
  ({ one }) => ({
    receipt: one(stockReceipts, {
      fields: [stockReceiptItems.receiptId],
      references: [stockReceipts.id],
    }),
    product: one(products, {
      fields: [stockReceiptItems.productId],
      references: [products.id],
    }),
    material: one(materials, {
      fields: [stockReceiptItems.materialId],
      references: [materials.id],
    }),
    orderItem: one(orderItems, {
      fields: [stockReceiptItems.orderItemId],
      references: [orderItems.id],
    }),
  }),
);
