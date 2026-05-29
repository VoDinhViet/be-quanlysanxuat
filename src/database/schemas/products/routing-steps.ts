import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { suppliers } from '../suppliers';
import { operations } from './operations';
import { productRevisions } from './product-revisions';
import { products } from './products';

export const routingSteps = pgTable('routing_steps', {
  // ID bước routing.
  id: uuid('id').defaultRandom().primaryKey(),
  // Phiên bản sản phẩm.
  productRevisionId: uuid('product_revision_id')
    .notNull()
    .references(() => productRevisions.id, { onDelete: 'cascade' }),
  // Item sản xuất.
  itemId: uuid('item_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // Công đoạn.
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'restrict' }),
  // Thứ tự công đoạn.
  stepNo: integer('step_no').notNull(),
  // Công đoạn gia công ngoài.
  isOutsideProcess: boolean('is_outside_process').notNull().default(false),
  // Nhà cung cấp mặc định.
  defaultSupplierId: uuid('default_supplier_id').references(() => suppliers.id, {
    onDelete: 'set null',
  }),
  // Ghi chú.
  note: text('note'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const routingStepsRelations = relations(routingSteps, ({ one }) => ({
  productRevision: one(productRevisions, {
    fields: [routingSteps.productRevisionId],
    references: [productRevisions.id],
  }),
  item: one(products, {
    fields: [routingSteps.itemId],
    references: [products.id],
  }),
  operation: one(operations, {
    fields: [routingSteps.operationId],
    references: [operations.id],
  }),
  defaultSupplier: one(suppliers, {
    fields: [routingSteps.defaultSupplierId],
    references: [suppliers.id],
  }),
}));

export type RoutingStep = typeof routingSteps.$inferSelect;
export type NewRoutingStep = typeof routingSteps.$inferInsert;
