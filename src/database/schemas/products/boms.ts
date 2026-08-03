import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { bomItems } from './bom-items';
import { products } from './products';
import { users } from '../identity-access/users';

/** Header row: exactly one BOM per product. Body rows live in `bom_items`. */
export const boms = pgTable(
  'boms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .unique()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, {
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

export const bomsRelations = relations(boms, ({ one, many }) => ({
  product: one(products, {
    fields: [boms.productId],
    references: [products.id],
  }),
  creator: one(users, {
    fields: [boms.createdBy],
    references: [users.id],
  }),
  items: many(bomItems),
}));
