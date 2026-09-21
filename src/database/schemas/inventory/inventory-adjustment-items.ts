import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { inventoryAdjustments } from './inventory-adjustments';
import { items } from '../items/items';
import { units } from '../units/units';

/** Một dòng phiếu điều chỉnh — `quantity` luôn dương, dấu suy từ `adjustmentType` của header lúc
 * `post`, không ở đây (cùng khuôn `inventory_receipt_items`). `unitId` chỉ để hiển thị
 * (`docs/decisions/unit-conversion.md`) — không quy đổi, mọi bút toán đọc thẳng `quantity`. */
export const inventoryAdjustmentItems = pgTable(
  'inventory_adjustment_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    adjustmentId: uuid('adjustment_id')
      .notNull()
      .references(() => inventoryAdjustments.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_inventory_adjustment_items_adjustment_id').on(
      table.adjustmentId,
    ),
    index('idx_inventory_adjustment_items_item_id').on(table.itemId),
    index('idx_inventory_adjustment_items_unit_id').on(table.unitId),
    unique('uq_inventory_adjustment_items_adjustment_item').on(
      table.adjustmentId,
      table.itemId,
    ),
    check(
      'chk_inventory_adjustment_items_quantity_positive',
      sql`quantity > 0`,
    ),
  ],
);

export const inventoryAdjustmentItemsRelations = relations(
  inventoryAdjustmentItems,
  ({ one }) => ({
    adjustment: one(inventoryAdjustments, {
      fields: [inventoryAdjustmentItems.adjustmentId],
      references: [inventoryAdjustments.id],
    }),
    item: one(items, {
      fields: [inventoryAdjustmentItems.itemId],
      references: [items.id],
    }),
    unit: one(units, {
      fields: [inventoryAdjustmentItems.unitId],
      references: [units.id],
    }),
  }),
);

export type InventoryAdjustmentItemSelect =
  typeof inventoryAdjustmentItems.$inferSelect;
