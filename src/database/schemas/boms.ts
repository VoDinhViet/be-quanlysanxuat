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

import { credentials } from './credentials';
import { files } from './files';
import { materials } from './materials';
import { products } from './products';

/** Custom Drizzle type for PostgreSQL ltree extension */
export const ltree = customType<{ data: string }>({
  dataType() {
    return 'ltree';
  },
});

/** Header row: exactly one BOM per product. Body rows live in `bom_items`. */
export const boms = pgTable(
  'boms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .unique()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('idx_boms_created_by').on(table.createdBy)],
);

/**
 * What a bom_item points at. A non-leaf item references a WIP `products` row (Cụm/Chi tiết); a
 * leaf references a `materials` row (Vật tư). Exactly one of `productId`/`materialId` is set,
 * matching `itemType`.
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
 * One line of a BOM tree. The FG root ("Cấp 0") is NOT stored here — top-level items carry
 * `parentId = null` and represent the root's direct children ("Cấp 1").
 * `path` (ltree) and `level` store hierarchical path & depth level for fast tree queries.
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
    itemType: bomItemTypeEnum('item_type').notNull(),
    // Exactly one of the next two is populated, keyed by itemType (enforced by DB CHECK).
    // `restrict`: a product/material referenced in a BOM can't be hard-deleted out from under it.
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'restrict',
    }),
    materialId: uuid('material_id').references(() => materials.id, {
      onDelete: 'restrict',
    }),
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
    // A technical drawing specific to this node — independent of `image`, which is coalesced
    // (read-time, not stored) from whichever product/material the node links to.
    drawingFileId: uuid('drawing_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => credentials.id, {
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
    index('idx_bom_items_material_id').on(table.materialId),
    index('idx_bom_items_created_by').on(table.createdBy),
    index('idx_bom_items_drawing_file_id').on(table.drawingFileId),
    index('idx_bom_items_path').on(table.path),
    check(
      'chk_bom_items_item_type_target',
      sql`(item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)`,
    ),
    check('chk_bom_items_quantity_positive', sql`quantity > 0`),
  ],
);

export const bomsRelations = relations(boms, ({ one, many }) => ({
  product: one(products, {
    fields: [boms.productId],
    references: [products.id],
  }),
  creator: one(credentials, {
    fields: [boms.createdBy],
    references: [credentials.id],
  }),
  items: many(bomItems),
}));

export const bomItemsRelations = relations(bomItems, ({ one }) => ({
  bom: one(boms, {
    fields: [bomItems.bomId],
    references: [boms.id],
  }),
  product: one(products, {
    fields: [bomItems.productId],
    references: [products.id],
  }),
  material: one(materials, {
    fields: [bomItems.materialId],
    references: [materials.id],
  }),
  drawingFile: one(files, {
    fields: [bomItems.drawingFileId],
    references: [files.id],
  }),
  creator: one(credentials, {
    fields: [bomItems.createdBy],
    references: [credentials.id],
  }),
}));
