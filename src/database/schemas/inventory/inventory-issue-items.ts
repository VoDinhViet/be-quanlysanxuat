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

import { inventoryIssues } from './inventory-issues';
import { items } from '../items/items';
import { orderItems } from '../orders/order-items';

/** Một dòng phiếu xuất — cùng khuôn `inventory_receipt_items`, không có `unitPrice`. `orderItemId`
 * là mối nối duy nhất sang Orders (cơ sở tính `reserved`) — chỉ hợp lệ khi item là FG,
 * service-enforced (`InventoryIssuesService.ensureItemsValid`). */
export const inventoryIssueItems = pgTable(
  'inventory_issue_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => inventoryIssues.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
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
    index('idx_inventory_issue_items_item_id').on(table.itemId),
    index('idx_inventory_issue_items_order_item_id').on(table.orderItemId),
    check('chk_inventory_issue_items_quantity_positive', sql`quantity > 0`),
  ],
);

export const inventoryIssueItemsRelations = relations(
  inventoryIssueItems,
  ({ one }) => ({
    issue: one(inventoryIssues, {
      fields: [inventoryIssueItems.issueId],
      references: [inventoryIssues.id],
    }),
    item: one(items, {
      fields: [inventoryIssueItems.itemId],
      references: [items.id],
    }),
    orderItem: one(orderItems, {
      fields: [inventoryIssueItems.orderItemId],
      references: [orderItems.id],
    }),
  }),
);

export type InventoryIssueItemSelect = typeof inventoryIssueItems.$inferSelect;
