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

import { inventoryItemTypeEnum } from './inventory-documents';
import { inventoryReceipts } from './inventory-receipts';
import { materials } from '../materials/materials';
import { products } from '../products/products';

/** Một dòng phiếu nhập. `quantity` luôn dương — dấu chỉ xuất hiện ở bút toán sinh ra lúc `post`,
 * không ở đây. Đúng một trong `productId`/`materialId` được set, khớp `itemType` (DB CHECK, cùng
 * khuôn `chk_bom_items_item_type_target`). */
export const inventoryReceiptItems = pgTable(
  'inventory_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => inventoryReceipts.id, { onDelete: 'cascade' }),
    itemType: inventoryItemTypeEnum('item_type').notNull(),
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
    index('idx_inventory_receipt_items_product_id').on(table.productId),
    index('idx_inventory_receipt_items_material_id').on(table.materialId),
    check('chk_inventory_receipt_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_inventory_receipt_items_unit_price',
      sql`unit_price IS NULL OR unit_price >= 0`,
    ),
    check(
      'chk_inventory_receipt_items_target',
      sql`(item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)`,
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
    product: one(products, {
      fields: [inventoryReceiptItems.productId],
      references: [products.id],
    }),
    material: one(materials, {
      fields: [inventoryReceiptItems.materialId],
      references: [materials.id],
    }),
  }),
);
