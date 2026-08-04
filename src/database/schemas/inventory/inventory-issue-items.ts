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
import { inventoryIssues } from './inventory-issues';
import { materials } from '../materials/materials';
import { orderItems } from '../orders/order-items';
import { products } from '../products/products';

/** Một dòng phiếu xuất — cùng khuôn `inventory_receipt_items`, không có `unitPrice`. `orderItemId`
 * là mối nối duy nhất sang Orders (cơ sở tính `reserved`) — chỉ hợp lệ trên dòng
 * `itemType = PRODUCT`, service-enforced (`InventoryIssuesService.ensureItemsValid`). */
export const inventoryIssueItems = pgTable(
  'inventory_issue_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => inventoryIssues.id, { onDelete: 'cascade' }),
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
    orderItemId: uuid('order_item_id').references(() => orderItems.id, {
      onDelete: 'restrict',
    }),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_inventory_issue_items_issue_id').on(table.issueId),
    index('idx_inventory_issue_items_product_id').on(table.productId),
    index('idx_inventory_issue_items_material_id').on(table.materialId),
    index('idx_inventory_issue_items_order_item_id').on(table.orderItemId),
    check('chk_inventory_issue_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_inventory_issue_items_target',
      sql`(item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)`,
    ),
  ],
);

export const inventoryIssueItemsRelations = relations(
  inventoryIssueItems,
  ({ one }) => ({
    issue: one(inventoryIssues, {
      fields: [inventoryIssueItems.issueId],
      references: [inventoryIssues.id],
    }),
    product: one(products, {
      fields: [inventoryIssueItems.productId],
      references: [products.id],
    }),
    material: one(materials, {
      fields: [inventoryIssueItems.materialId],
      references: [materials.id],
    }),
    orderItem: one(orderItems, {
      fields: [inventoryIssueItems.orderItemId],
      references: [orderItems.id],
    }),
  }),
);
