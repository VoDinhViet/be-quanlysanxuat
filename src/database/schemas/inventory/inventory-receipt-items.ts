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

/** Một dòng phiếu nhập. `quantity` luôn dương — dấu chỉ xuất hiện ở bút toán sinh ra lúc `post`,
 * không ở đây. */
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
  }),
);
