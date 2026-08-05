import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clients } from '../clients/clients';
import { files } from '../files';
import { productGroups } from './product-groups';
import { units } from '../units/units';
import { users } from '../identity-access/users';

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export const productStatusEnum = pgEnum('product_status', [
  ProductStatus.ACTIVE,
  ProductStatus.INACTIVE,
]);

/**
 * Rules:
 * - FINISHED_GOOD (thành phẩm) is a sellable end product; WORK_IN_PROGRESS (bán thành phẩm) is
 *   an intermediate part that only exists as a component inside another product's BOM. Both live
 *   in this same `products` table, sharing every mechanic (image, BOM, routing), differing only
 *   in use: a FINISHED_GOOD is the root of its own structure tree, a WORK_IN_PROGRESS is
 *   referenced as a child node from some other product's BOM tree (`bom_items`, see `bom-items.ts`).
 * - Raw materials (RM) are a different table entirely — see `materials`.
 */
export enum ProductType {
  FINISHED_GOOD = 'FINISHED_GOOD',
  WORK_IN_PROGRESS = 'WORK_IN_PROGRESS',
}

export const productTypeEnum = pgEnum('product_type', [
  ProductType.FINISHED_GOOD,
  ProductType.WORK_IN_PROGRESS,
]);

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    type: productTypeEnum('type').notNull().default(ProductType.FINISHED_GOOD),
    imageFileId: uuid('image_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    /**
     * Rules:
     * - Which product this one was cloned from ("Sao chép từ"), for lineage only — a clone is a
     *   fully independent product (own BOM, own routing), this is display-only provenance.
     *   Nullable: most products aren't clones.
     * - Self-referencing forward reference — needs the explicit `AnyPgColumn` return type to
     *   break TypeScript's circular inference within the same table.
     */
    clonedFromProductId: uuid('cloned_from_product_id').references(
      (): AnyPgColumn => products.id,
      { onDelete: 'set null' },
    ),
    status: productStatusEnum('status').notNull().default(ProductStatus.ACTIVE),
    note: varchar('note', { length: 1000 }),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    productGroupId: uuid('product_group_id').references(
      () => productGroups.id,
      {
        onDelete: 'set null',
      },
    ),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_products_client_id').on(table.clientId),
    index('idx_products_product_group_id').on(table.productGroupId),
    index('idx_products_unit_id').on(table.unitId),
    index('idx_products_cloned_from_product_id').on(
      table.clonedFromProductId,
    ),
    index('idx_products_created_by').on(table.createdBy),
    index('idx_products_image_file_id').on(table.imageFileId),
  ],
);

export const productsRelations = relations(products, ({ one }) => ({
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
  creator: one(users, {
    fields: [products.createdBy],
    references: [users.id],
  }),
  imageFile: one(files, {
    fields: [products.imageFileId],
    references: [files.id],
  }),
  clonedFrom: one(products, {
    fields: [products.clonedFromProductId],
    references: [products.id],
  }),
}));
