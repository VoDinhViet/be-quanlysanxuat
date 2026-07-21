import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clients } from './clients';
import { credentials } from './credentials';
import { files } from './files';
import { productGroups } from './product-groups';
import { units } from './units';

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export const productStatusEnum = pgEnum('product_status', [
  ProductStatus.ACTIVE,
  ProductStatus.INACTIVE,
]);

/**
 * FG (thành phẩm) is a sellable end product; WIP (bán thành phẩm) is an intermediate part that
 * only exists as a component inside another product's BOM. Both live in this same `products`
 * table — they share every mechanic (image, revision, BOM, routing) and only differ in how they're
 * used: a FG is the root of its own structure tree, a WIP is referenced as a child node from some
 * other product's tree (Phase 2, `structure_nodes`). Raw materials (RM) are a different table
 * entirely — see `materials`.
 */
export enum ProductType {
  FG = 'FG',
  WIP = 'WIP',
}

export const productTypeEnum = pgEnum('product_type', [ProductType.FG, ProductType.WIP]);

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  type: productTypeEnum('type').notNull().default(ProductType.FG),
  imageFileId: uuid('image_file_id').references(() => files.id, { onDelete: 'set null' }),
  /**
   * Which `product_revisions` row is "current" for this product — the only definition of
   * "active revision" (there is no status enum on `product_revisions` itself). Nullable forever:
   * a freshly-inserted product has this `null` for the few statements between inserting the
   * product row and inserting+pointing at its first revision (see `ProductsService.createProduct`).
   * Forward reference to a table declared below in this same file — needs the explicit
   * `AnyPgColumn` return type to break TypeScript's circular inference between the two tables.
   */
  currentRevisionId: uuid('current_revision_id').references(
    (): AnyPgColumn => productRevisions.id,
    { onDelete: 'set null' },
  ),
  status: productStatusEnum('status').notNull().default(ProductStatus.ACTIVE),
  note: varchar('note', { length: 1000 }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  productGroupId: uuid('product_group_id').references(() => productGroups.id, {
    onDelete: 'set null',
  }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'restrict' }),
  createdBy: uuid('created_by').references(() => credentials.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
});

/**
 * 1-many with products: the "tài liệu đính kèm" panel. Each row is a link to a `files` registry
 * row, never a bare URL. Replace-all on update.
 */
export const productAttachments = pgTable(
  'product_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_product_attachments_product_id').on(table.productId)],
);

/**
 * Version history for a product's (future) structure/routing — Phase 2 (`structure_nodes`,
 * `node_operations`) will hang off `revisionId` here, so "Tạo revision mới" can clone a snapshot
 * instead of overwriting in place. No `status` enum: "current" is defined purely by
 * `products.currentRevisionId` pointing at a row here. No `deletedAt`: no delete endpoint exists
 * yet (would be a dead column).
 */
export const productRevisions = pgTable(
  'product_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    revisionNo: varchar('revision_no', { length: 50 }).notNull(),
    note: varchar('note', { length: 1000 }),
    /**
     * Which revision this one was branched/copied from ("Sao chép từ"), for lineage only — there is
     * no structure/routing content yet to actually duplicate (Phase 2). Nullable: the very first
     * revision of a product (`R01`) and rows backfilled from the old `products.revision` string have
     * no source. Self-referencing forward reference — same `AnyPgColumn` thunk technique as
     * `products.currentRevisionId` above, needed here because `productRevisions` can't be referenced
     * inside its own initializer.
     */
    sourceRevisionId: uuid('source_revision_id').references(
      (): AnyPgColumn => productRevisions.id,
      { onDelete: 'set null' },
    ),
    createdBy: uuid('created_by').references(() => credentials.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Per-product uniqueness, not global — "R01" exists once per product, not once ever.
    unique('uq_product_revisions_product_revision_no').on(table.productId, table.revisionNo),
    index('idx_product_revisions_product_id').on(table.productId),
  ],
);

export const productsRelations = relations(products, ({ one, many }) => ({
  client: one(clients, {
    fields: [products.clientId],
    references: [clients.id],
  }),
  group: one(productGroups, {
    fields: [products.productGroupId],
    references: [productGroups.id],
  }),
  unit: one(units, {
    fields: [products.unitId],
    references: [units.id],
  }),
  creator: one(credentials, {
    fields: [products.createdBy],
    references: [credentials.id],
  }),
  imageFile: one(files, {
    fields: [products.imageFileId],
    references: [files.id],
  }),
  attachments: many(productAttachments),
  currentRevision: one(productRevisions, {
    fields: [products.currentRevisionId],
    references: [productRevisions.id],
  }),
  revisions: many(productRevisions),
}));

export const productAttachmentsRelations = relations(productAttachments, ({ one }) => ({
  product: one(products, {
    fields: [productAttachments.productId],
    references: [products.id],
  }),
  file: one(files, {
    fields: [productAttachments.fileId],
    references: [files.id],
  }),
}));

export const productRevisionsRelations = relations(productRevisions, ({ one }) => ({
  product: one(products, {
    fields: [productRevisions.productId],
    references: [products.id],
  }),
  creator: one(credentials, {
    fields: [productRevisions.createdBy],
    references: [credentials.id],
  }),
  source: one(productRevisions, {
    fields: [productRevisions.sourceRevisionId],
    references: [productRevisions.id],
  }),
}));
