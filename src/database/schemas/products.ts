import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

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

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  imageFileId: uuid('image_file_id').references(() => files.id, { onDelete: 'set null' }),
  revision: varchar('revision', { length: 50 }).notNull().default('R01'),
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
