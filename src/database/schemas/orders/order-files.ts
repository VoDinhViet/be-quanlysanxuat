import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { orders } from './orders';

/**
 * 1-many with orders: the "tài liệu đính kèm" panel. Each row is a link to a `files` registry
 * row, never a bare URL. Replace-all on update — same shape as `supplier_files`.
 */
export const orderFiles = pgTable(
  'order_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_order_files_order_id').on(table.orderId),
    index('idx_order_files_file_id').on(table.fileId),
  ],
);

export const orderFilesRelations = relations(orderFiles, ({ one }) => ({
  order: one(orders, {
    fields: [orderFiles.orderId],
    references: [orders.id],
  }),
  file: one(files, {
    fields: [orderFiles.fileId],
    references: [files.id],
  }),
}));
