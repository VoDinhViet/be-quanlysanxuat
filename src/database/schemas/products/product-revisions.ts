import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { bomLines } from './bom-lines';
import { products } from './products';
import { routingSteps } from './routing-steps';

/**
 * Lưu phiên bản sản phẩm dùng cho BOM và routing.
 * Job sản xuất đã tạo vẫn giữ revision cũ khi có revision mới.
 */
export const productRevisions = pgTable('product_revisions', {
  // ID phiên bản sản phẩm.
  id: uuid('id').defaultRandom().primaryKey(),
  // Sản phẩm.
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  // Mã phiên bản.
  revisionNo: varchar('revision_no', { length: 50 }).notNull(),
  // Ghi chú phiên bản.
  note: text('note'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const productRevisionsRelations = relations(productRevisions, ({ one, many }) => ({
  product: one(products, {
    fields: [productRevisions.productId],
    references: [products.id],
  }),
  // product_revisions 1-n bom_lines.
  bomLines: many(bomLines),
  // product_revisions 1-n routing_steps.
  routingSteps: many(routingSteps),
}));

export type ProductRevision = typeof productRevisions.$inferSelect;
export type NewProductRevision = typeof productRevisions.$inferInsert;
