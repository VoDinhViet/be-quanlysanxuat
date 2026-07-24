import { relations } from 'drizzle-orm';
import {
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Which kind of entity may be measured in a given unit. Stored as rows in `unit_scopes`, not as
 * columns on `units`: a new consumer (packaging, tooling, ...) is then one enum value plus data,
 * never a new column and a rewrite of every query, seed and test mock.
 */
export enum UnitScope {
  PRODUCT = 'PRODUCT',
  MATERIAL = 'MATERIAL',
  SEMI_FINISHED = 'SEMI_FINISHED',
}

export const unitScopeEnum = pgEnum('unit_scope', [
  UnitScope.PRODUCT,
  UnitScope.MATERIAL,
  UnitScope.SEMI_FINISHED,
]);

/**
 * Units of measure ("đơn vị tính"/ĐVT), shared across every entity that needs one — deliberately
 * one table rather than per-entity tables, so a unit keeps a single identity and a future
 * BOM/inventory module can tell that a material in `Kg` and a product in `Kg` are the same unit.
 * Which entities may use a given unit is expressed by `unitScopes`, not by columns here.
 */
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

/**
 * One row per (unit, scope): `Tấm` is MATERIAL only, `Cái` is all three. The composite primary key
 * is the uniqueness constraint — no surrogate id needed. Cascades because a scope row is
 * meaningless without its unit (units themselves are held by `restrict` from products/materials).
 */
export const unitScopes = pgTable(
  'unit_scopes',
  {
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    scope: unitScopeEnum('scope').notNull(),
  },
  (table) => [primaryKey({ columns: [table.unitId, table.scope] })],
);

export const unitsRelations = relations(units, ({ many }) => ({
  scopes: many(unitScopes),
}));

export const unitScopesRelations = relations(unitScopes, ({ one }) => ({
  unit: one(units, {
    fields: [unitScopes.unitId],
    references: [units.id],
  }),
}));
