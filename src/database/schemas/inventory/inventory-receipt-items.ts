import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { inventoryReceipts } from './inventory-receipts';
import { items } from '../items/items';
import { purchaseOrderItems } from '../purchasing/purchase-order-items';

/** Một dòng phiếu nhập. `quantity` luôn dương — dấu chỉ xuất hiện ở bút toán sinh ra lúc `post`,
 * không ở đây. `purchaseOrderItemId` là nguồn duy nhất để sổ cái mua hàng tính "SL đã nhập kho"
 * theo từng dòng vật tư (`docs/domains/purchasing.md`) — chỉ đọc khi phiếu `POSTED`. */
export const inventoryReceiptItems = pgTable(
  'inventory_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => inventoryReceipts.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    purchaseOrderItemId: uuid('purchase_order_item_id').references(
      () => purchaseOrderItems.id,
      { onDelete: 'set null' },
    ),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    unitPrice: numeric('unit_price', {
      precision: 18,
      scale: 2,
      mode: 'number',
    }),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_inventory_receipt_items_receipt_id').on(table.receiptId),
    index('idx_inventory_receipt_items_item_id').on(table.itemId),
    index('idx_inventory_receipt_items_purchase_order_item_id').on(
      table.purchaseOrderItemId,
    ),
    check('chk_inventory_receipt_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_inventory_receipt_items_unit_price',
      sql`unit_price IS NULL OR unit_price >= 0`,
    ),
  ],
);

export const inventoryReceiptItemsRelations = relations(
  inventoryReceiptItems,
  ({ one }) => ({
    receipt: one(inventoryReceipts, {
      fields: [inventoryReceiptItems.receiptId],
      references: [inventoryReceipts.id],
    }),
    item: one(items, {
      fields: [inventoryReceiptItems.itemId],
      references: [items.id],
    }),
    purchaseOrderItem: one(purchaseOrderItems, {
      fields: [inventoryReceiptItems.purchaseOrderItemId],
      references: [purchaseOrderItems.id],
    }),
  }),
);

export type InventoryReceiptItemSelect =
  typeof inventoryReceiptItems.$inferSelect;
