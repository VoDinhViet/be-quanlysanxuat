import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { bomLines } from './bom-lines';
import { products } from './products';

export const units = pgTable('units', {
  // ID đơn vị tính.
  id: uuid('id').defaultRandom().primaryKey(),
  // Mã đơn vị tính.
  code: varchar('code', { length: 50 }).notNull(),
  // Tên đơn vị tính.
  name: varchar('name', { length: 255 }).notNull(),
  // Ghi chú.
  note: text('note'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const unitsRelations = relations(units, ({ many }) => ({
  bomLines: many(bomLines),
  products: many(products),
}));

export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
