import { relations } from 'drizzle-orm';
import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { unitScopes } from './unit-scopes';

/** Units of measure ("đơn vị tính"/ĐVT), shared across every entity that needs one —
 * deliberately one table rather than per-entity tables, so a unit keeps a single identity and a
 * BOM/inventory module can tell a material in `Kg` and a product in `Kg` are the same unit. Which
 * entities may use a given unit is expressed by `unitScopes`, not by columns here. */
export const units = pgTable('units', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const unitsRelations = relations(units, ({ many }) => ({
  scopes: many(unitScopes),
}));
