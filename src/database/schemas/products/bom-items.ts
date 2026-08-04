import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  customType,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { boms } from './boms';
import { files } from '../files';
import { products } from './products';
import { users } from '../identity-access/users';

/** Custom Drizzle type for PostgreSQL ltree extension */
export const ltree = customType<{ data: string }>({
  dataType() {
    return 'ltree';
  },
});

/**
 * Không còn dùng làm cột của `bom_items` (bảng này giờ thuần cấu trúc WIP) — giữ export vì
 * `production_job_bom_items` (snapshot Job, đóng băng, vẫn phân biệt PRODUCT/MATERIAL) import
 * `bomItemTypeEnum`. Xem `docs/decisions/` hoặc `docs/domains/product-structure.md` về việc tách
 * vật tư sang `bom_item_materials`.
 */
export enum BomItemType {
  PRODUCT = 'PRODUCT',
  MATERIAL = 'MATERIAL',
}

export const bomItemTypeEnum = pgEnum('bom_item_type', [
  BomItemType.PRODUCT,
  BomItemType.MATERIAL,
]);

/**
 * One line of the BOM structure tree — always a WIP sub-assembly. The FG root ("Cấp 0") is NOT
 * stored here — top-level items carry `parentId = null` and represent the root's direct children
 * ("Cấp 1"). `path` (ltree) and `level` store hierarchical path & depth level for fast tree
 * queries. Materials live in `bom_item_materials`, as-used against a node (or the root) here.
 */
export const bomItems = pgTable(
  'bom_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),
    // Self-referencing forward reference — same AnyPgColumn thunk as products.sourceProductId.
    // Null = top-level item (direct child of the FG root).
    parentId: uuid('parent_id').references((): AnyPgColumn => bomItems.id, {
      onDelete: 'cascade',
    }),
    // `restrict`: a product referenced in a BOM can't be hard-deleted out from under it.
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    // Path and level for hierarchical tree acceleration
    path: ltree('path'),
    level: integer('level').notNull().default(1),
    // Deterministic sibling ordering — the UI's "STT" (e.g. "1.0.3") is presentational, derived
    // from tree position + this.
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 1000 }),
    // A technical drawing specific to this node — independent of `image`, which is read (not
    // stored) from the linked WIP's own `imageFileId`.
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
    index('idx_bom_items_product_id').on(table.productId),
    index('idx_bom_items_created_by').on(table.createdBy),
    index('idx_bom_items_drawing_file_id').on(table.drawingFileId),
    index('idx_bom_items_path').on(table.path),
    check('chk_bom_items_quantity_positive', sql`quantity > 0`),
  ],
);

export const bomItemsRelations = relations(bomItems, ({ one }) => ({
  bom: one(boms, {
    fields: [bomItems.bomId],
    references: [boms.id],
  }),
  product: one(products, {
    fields: [bomItems.productId],
    references: [products.id],
  }),
  drawingFile: one(files, {
    fields: [bomItems.drawingFileId],
    references: [files.id],
  }),
  creator: one(users, {
    fields: [bomItems.createdBy],
    references: [users.id],
  }),
}));
