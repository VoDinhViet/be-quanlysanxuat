import { relations } from 'drizzle-orm';
import { integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { productRevisions } from './product-revisions';
import { products } from './products';
import { units } from './units';

export const bomLines = pgTable('bom_lines', {
  // ID dòng BOM.
  id: uuid('id').defaultRandom().primaryKey(),
  // Phiên bản sản phẩm.
  productRevisionId: uuid('product_revision_id')
    .notNull()
    .references(() => productRevisions.id, { onDelete: 'cascade' }),
  // Item cha.
  parentItemId: uuid('parent_item_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // Item con.
  childItemId: uuid('child_item_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // Số lượng cần.
  qty: numeric('qty', { precision: 18, scale: 3 }).notNull(),
  // Đơn vị tính.
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'restrict' }),
  // Tỷ lệ hao hụt.
  scrapRate: numeric('scrap_rate', { precision: 8, scale: 4 }).notNull().default('0'),
  // Cấp BOM.
  level: integer('level').notNull().default(1),
  // Ghi chú.
  note: text('note'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const bomLinesRelations = relations(bomLines, ({ one }) => ({
  // bom_lines n-1 product_revisions.
  productRevision: one(productRevisions, {
    fields: [bomLines.productRevisionId],
    references: [productRevisions.id],
  }),
  // bom_lines n-1 products as parent_item.
  parentItem: one(products, {
    fields: [bomLines.parentItemId],
    references: [products.id],
    relationName: 'parentItem',
  }),
  // bom_lines n-1 products as child_item.
  childItem: one(products, {
    fields: [bomLines.childItemId],
    references: [products.id],
    relationName: 'childItem',
  }),
  unit: one(units, {
    fields: [bomLines.unitId],
    references: [units.id],
  }),
}));

export type BomLine = typeof bomLines.$inferSelect;
export type NewBomLine = typeof bomLines.$inferInsert;
