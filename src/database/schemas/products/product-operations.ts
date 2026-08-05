import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { operations } from '../operations';
import { products } from './products';
import { users } from '../identity-access/users';

/**
 * Routing Cấp 0: chuỗi công đoạn của chính sản phẩm gốc (`productId`), hiển thị như dòng "STT 0"
 * của lưới cấu trúc — vd. Cắt laser → Chấn → Hàn → Sơn tĩnh điện. Công đoạn as-used của một node BOM
 * cụ thể sống ở bảng riêng `bom_operations`, không còn ở đây.
 *
 * Rules:
 * - No uniqueness on `(productId, operationId)`: a real routing can revisit the same operation
 *   more than once (e.g. Kiểm tra → Gia công → Kiểm tra).
 */
export const productOperations = pgTable(
  'product_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    // restrict: an operation referenced by a product operation can't be hard-deleted out from
    // under it — same reasoning as `bom_items.productId`/`materialId`. `operations` itself is
    // soft-deleted, so it can still be retired without breaking this reference.
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'restrict' }),
    // STT chạy — deterministic step ordering, tiebreak by createdAt, mirroring
    // `bom_items.sortOrder`.
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_product_operations_product_id').on(table.productId),
    index('idx_product_operations_operation_id').on(table.operationId),
    index('idx_product_operations_created_by').on(table.createdBy),
  ],
);

export const productOperationsRelations = relations(
  productOperations,
  ({ one }) => ({
    product: one(products, {
      fields: [productOperations.productId],
      references: [products.id],
    }),
    operation: one(operations, {
      fields: [productOperations.operationId],
      references: [operations.id],
    }),
    creator: one(users, {
      fields: [productOperations.createdBy],
      references: [users.id],
    }),
  }),
);
