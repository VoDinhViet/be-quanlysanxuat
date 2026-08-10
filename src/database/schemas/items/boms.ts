import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { bomItems } from './bom-items';
import { items } from './items';
import { users } from '../identity-access/users';

/** Header row: exactly one BOM per item. Body rows live in `bom_items`. */
export const boms = pgTable(
  'boms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .unique()
      .references(() => items.id, { onDelete: 'cascade' }),
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
  item: one(items, {
    fields: [boms.itemId],
    references: [items.id],
  }),
  creatorBy: one(users, {
    fields: [boms.createdBy],
    references: [users.id],
  }),
  bomItems: many(bomItems),
}));
