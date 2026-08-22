import { relations } from 'drizzle-orm';
import {
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { units } from './units';

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
 * One row per (unit, scope): `Tấm` is MATERIAL only, `Cái` is all three. The composite primary key
 * is the uniqueness constraint — no surrogate id needed. Cascades because a scope row is
 * meaningless without its unit (units themselves are held by `restrict` from products/materials).
 * No `updatedAt` — seeded once, only ever inserted/deleted, never mutated in place (a composite-key
 * row has no non-key column to update anyway).
 */
export const unitScopes = pgTable(
  'unit_scopes',
  {
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    scope: unitScopeEnum('scope').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.unitId, table.scope] })],
);

export const unitScopesRelations = relations(unitScopes, ({ one }) => ({
  unit: one(units, {
    fields: [unitScopes.unitId],
    references: [units.id],
  }),
}));

export type UnitScopeSelect = typeof unitScopes.$inferSelect;
