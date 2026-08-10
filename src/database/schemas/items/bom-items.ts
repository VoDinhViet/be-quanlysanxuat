import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { boms } from './boms';
import { files } from '../files';
import { items } from './items';
import { users } from '../identity-access/users';

/**
 * One line of the BOM tree — either a WIP sub-assembly node or a RM leaf (`item.type`, không còn
 * bảng `bom_materials` riêng — xem `docs/decisions/items-merge.md`). The FG root ("Cấp 0") is NOT
 * stored here — top-level items carry `parentId = null` and represent the root's direct children
 * ("Cấp 1"). `level` stores 1-based depth, read straight into the response.
 *
 * Rules:
 * - Một node RM là lá bắt buộc — không được có con, không được gắn `bom_operations`
 *   (`BomsService`).
 */
export const bomItems = pgTable(
  'bom_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),
    // Self-referencing forward reference — same AnyPgColumn thunk as items.clonedFromItemId.
    // Null = top-level item (direct child of the FG root).
    parentId: uuid('parent_id').references((): AnyPgColumn => bomItems.id, {
      onDelete: 'cascade',
    }),
    // `restrict`: một item đang được BOM tham chiếu không thể bị xoá cứng ra khỏi dưới chân nó.
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    level: integer('level').notNull().default(1),
    // Deterministic sibling ordering — the UI's "STT" (e.g. "1.0.3") is presentational, derived
    // from tree position + this.
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 1000 }),
    // A technical drawing specific to this node — independent of `image`, which is read (not
    // stored) from the linked item's own `imageFileId`.
    drawingFileId: uuid('drawing_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_bom_items_bom_id').on(table.bomId),
    index('idx_bom_items_parent_id').on(table.parentId),
    index('idx_bom_items_item_id').on(table.itemId),
    index('idx_bom_items_created_by').on(table.createdBy),
    index('idx_bom_items_drawing_file_id').on(table.drawingFileId),
    check('chk_bom_items_quantity_positive', sql`quantity > 0`),
  ],
);

export type BomItemSelect = typeof bomItems.$inferSelect;

export const bomItemsRelations = relations(bomItems, ({ one }) => ({
  bom: one(boms, {
    fields: [bomItems.bomId],
    references: [boms.id],
  }),
  item: one(items, {
    fields: [bomItems.itemId],
    references: [items.id],
  }),
  drawingFile: one(files, {
    fields: [bomItems.drawingFileId],
    references: [files.id],
  }),
  creatorBy: one(users, {
    fields: [bomItems.createdBy],
    references: [users.id],
  }),
}));
