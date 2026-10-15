import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { items } from '../items/items';
import { ncrs } from './ncrs';

export enum NcrCostKind {
  MATERIAL = 'MATERIAL',
  LABOR = 'LABOR',
  OUTSOURCING = 'OUTSOURCING',
  OTHER = 'OTHER',
}

export const ncrCostKindEnum = pgEnum('ncr_cost_kind', [
  NcrCostKind.MATERIAL,
  NcrCostKind.LABOR,
  NcrCostKind.OUTSOURCING,
  NcrCostKind.OTHER,
]);

/** Dòng dự toán chi phí của NCR, nhập tay; `amount` = `quantity × unitPrice` do `saveCostLines`
 * tính. `isSuggested` chưa có đường ghi nào đặt `true`. */
export const ncrCostLines = pgTable(
  'ncr_cost_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ncrId: uuid('ncr_id')
      .notNull()
      .references(() => ncrs.id, { onDelete: 'cascade' }),
    kind: ncrCostKindEnum('kind').notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    itemId: uuid('item_id').references(() => items.id, {
      onDelete: 'restrict',
    }),
    quantity: numeric('quantity', { precision: 18, scale: 3, mode: 'number' })
      .notNull()
      .default(1),
    unitPrice: numeric('unit_price', {
      precision: 18,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    amount: numeric('amount', { precision: 18, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    isSuggested: boolean('is_suggested').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_ncr_cost_lines_ncr_id').on(table.ncrId),
    index('idx_ncr_cost_lines_item_id').on(table.itemId),
    check(
      'chk_ncr_cost_lines_non_negative',
      sql`quantity >= 0 AND unit_price >= 0 AND amount >= 0`,
    ),
  ],
);

export const ncrCostLinesRelations = relations(ncrCostLines, ({ one }) => ({
  ncr: one(ncrs, { fields: [ncrCostLines.ncrId], references: [ncrs.id] }),
  item: one(items, { fields: [ncrCostLines.itemId], references: [items.id] }),
}));

export type NcrCostLineSelect = typeof ncrCostLines.$inferSelect;
