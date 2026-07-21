import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
import { materials } from './materials';
import { productRevisions, products } from './products';

/** Header row: exactly one BOM per revision. Body rows live in `bom_items`. */
export const boms = pgTable('boms', {
  id: uuid('id').defaultRandom().primaryKey(),
  revisionId: uuid('revision_id')
    .notNull()
    .unique()
    .references(() => productRevisions.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => credentials.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/**
 * What a bom_item points at. A non-leaf item references a WIP `products` row (Cụm/Chi tiết); a
 * leaf references a `materials` row (Vật tư). Exactly one of `productId`/`materialId` is set,
 * matching `itemType` — enforced in the service (the future writer), not by a DB CHECK, the same
 * way `materials.clientId` is only enforced in service code (no DB constraint either).
 */
export enum BomItemType {
  PRODUCT = 'PRODUCT',
  MATERIAL = 'MATERIAL',
}

export const bomItemTypeEnum = pgEnum('bom_item_type', [BomItemType.PRODUCT, BomItemType.MATERIAL]);

/**
 * One line of a BOM tree. The FG root ("Cấp 0") is NOT stored here — top-level items carry
 * `parentId = null` and represent the root's direct children ("Cấp 1"). No `deletedAt`: no delete
 * endpoint exists yet (same reasoning as `product_revisions`). No per-item `unitId`: unit is derived
 * from the linked product's/material's own `unitId` — there is no unit-conversion concept in the
 * system yet (see `docs/features/units.md`), so a separate item unit would be un-reconcilable.
 */
export const bomItems = pgTable(
  'bom_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),
    // Self-referencing forward reference — same AnyPgColumn thunk as products.currentRevisionId /
    // productRevisions.sourceRevisionId. Null = top-level item (direct child of the FG root).
    parentId: uuid('parent_id').references((): AnyPgColumn => bomItems.id, {
      onDelete: 'cascade',
    }),
    itemType: bomItemTypeEnum('item_type').notNull(),
    // Exactly one of the next two is populated, keyed by itemType (service-enforced, see above).
    // `restrict`: a product/material referenced in a BOM can't be hard-deleted out from under it.
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    materialId: uuid('material_id').references(() => materials.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    // Deterministic sibling ordering — the UI's "STT" (e.g. "1.0.3") is presentational, derived
    // from tree position + this.
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => credentials.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_bom_items_bom_id').on(table.bomId),
    index('idx_bom_items_parent_id').on(table.parentId),
  ],
);

export const bomsRelations = relations(boms, ({ one, many }) => ({
  revision: one(productRevisions, {
    fields: [boms.revisionId],
    references: [productRevisions.id],
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
  creator: one(credentials, {
    fields: [bomItems.createdBy],
    references: [credentials.id],
  }),
}));
