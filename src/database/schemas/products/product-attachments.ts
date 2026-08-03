import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { products } from './products';

/**
 * 1-many with products: the "tài liệu đính kèm" panel. Each row is a link to a `files` registry
 * row, never a bare URL. Replace-all on update.
 */
export const productAttachments = pgTable(
  'product_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_product_attachments_product_id').on(table.productId),
    index('idx_product_attachments_file_id').on(table.fileId),
  ],
);

export const productAttachmentsRelations = relations(
  productAttachments,
  ({ one }) => ({
    product: one(products, {
      fields: [productAttachments.productId],
      references: [products.id],
    }),
    file: one(files, {
      fields: [productAttachments.fileId],
      references: [files.id],
    }),
  }),
);
