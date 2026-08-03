import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { suppliers } from './suppliers';

/**
 * Join table onto the `files` registry, same shape as `material_attachments`. It deliberately
 * stores nothing but the link: url/filename/mimetype/size live on `files`, so attachments get
 * magic-byte validation, signed URLs and orphan sweeping for free instead of being a second,
 * weaker file registry.
 */
export const supplierAttachments = pgTable(
  'supplier_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_supplier_attachments_supplier_id').on(table.supplierId),
    index('idx_supplier_attachments_file_id').on(table.fileId),
  ],
);

export const supplierAttachmentsRelations = relations(
  supplierAttachments,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierAttachments.supplierId],
      references: [suppliers.id],
    }),
    file: one(files, {
      fields: [supplierAttachments.fileId],
      references: [files.id],
    }),
  }),
);
