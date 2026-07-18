import { relations } from 'drizzle-orm';
import { pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { clients } from './clients';
import { credentials } from './credentials';
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
  imageUrl: varchar('image_url', { length: 500 }),
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
  creator: one(credentials, {
    fields: [products.createdBy],
    references: [credentials.id],
  }),
}));
