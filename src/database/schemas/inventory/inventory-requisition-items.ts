import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { items } from '../items/items';
import { units } from '../units/units';
import { inventoryRequisitions } from './inventory-requisitions';

/** Một dòng phiếu lãnh vật tư — luôn RM (service-enforced, `E229`). Unique
 * `(requisitionId, itemId)` bắt buộc: phép SUM "Đã giữ"/"Đã lãnh"
 * (`src/api/inventory-requisitions/inventory-requisitions.query.ts`) và check vượt định mức BOM sẽ
 * sai nếu một phiếu có 2 dòng cùng vật tư. `unitId` chỉ để hiển thị (`docs/decisions/unit-conversion.md`)
 * — không quy đổi, mọi so sánh định mức đọc thẳng `quantity`. */
export const inventoryRequisitionItems = pgTable(
  'inventory_requisition_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requisitionId: uuid('requisition_id')
      .notNull()
      .references(() => inventoryRequisitions.id, { onDelete: 'cascade' }),
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
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_inventory_requisition_items_requisition_id').on(
      table.requisitionId,
    ),
    index('idx_inventory_requisition_items_item_id').on(table.itemId),
    index('idx_inventory_requisition_items_unit_id').on(table.unitId),
    unique('uq_inventory_requisition_items_requisition_item').on(
      table.requisitionId,
      table.itemId,
    ),
    check(
      'chk_inventory_requisition_items_quantity_positive',
      sql`quantity > 0`,
    ),
  ],
);

export const inventoryRequisitionItemsRelations = relations(
  inventoryRequisitionItems,
  ({ one }) => ({
    requisition: one(inventoryRequisitions, {
      fields: [inventoryRequisitionItems.requisitionId],
      references: [inventoryRequisitions.id],
    }),
    item: one(items, {
      fields: [inventoryRequisitionItems.itemId],
      references: [items.id],
    }),
    unit: one(units, {
      fields: [inventoryRequisitionItems.unitId],
      references: [units.id],
    }),
  }),
);

export type InventoryRequisitionItemSelect =
  typeof inventoryRequisitionItems.$inferSelect;
