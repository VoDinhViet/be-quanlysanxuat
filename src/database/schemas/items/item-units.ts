import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { units } from '../units/units';
import { items } from './items';

/**
 * Đơn vị phụ của một item + hệ số quy đổi ra đơn vị gốc (`items.unitId`, hệ số 1 ngầm định, không
 * có dòng riêng ở đây). Dòng phiếu kho snapshot `conversionFactor` từ bảng này lúc lập, không đọc
 * lại giá trị mới nhất sau đó (`docs/decisions/unit-conversion.md`).
 */
export const itemUnits = pgTable(
  'item_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    conversionFactor: numeric('conversion_factor', {
      precision: 18,
      scale: 6,
      mode: 'number',
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_item_units_item_id').on(table.itemId),
    index('idx_item_units_unit_id').on(table.unitId),
    unique('uq_item_units_item_unit').on(table.itemId, table.unitId),
    check(
      'chk_item_units_conversion_factor_positive',
      sql`conversion_factor > 0`,
    ),
  ],
);

export const itemUnitsRelations = relations(itemUnits, ({ one }) => ({
  item: one(items, {
    fields: [itemUnits.itemId],
    references: [items.id],
  }),
  unit: one(units, {
    fields: [itemUnits.unitId],
    references: [units.id],
  }),
}));

export type ItemUnitSelect = typeof itemUnits.$inferSelect;
