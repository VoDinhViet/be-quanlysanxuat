import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { suppliers } from './suppliers';

/**
 * Join table onto the `files` registry, same shape as `order_files`/`qc_files`. It
 * deliberately stores nothing but the link: url/filename/mimetype/size live on `files`, so
 * attachments get magic-byte validation and orphan sweeping for free instead of being a second,
 * weaker file registry. No `updatedAt` — a link row is only ever inserted or deleted, never
 * mutated.
 */
export const supplierFiles = pgTable(
  'supplier_files',
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
    index('idx_supplier_files_supplier_id').on(table.supplierId),
    index('idx_supplier_files_file_id').on(table.fileId),
    unique('uq_supplier_files_supplier_file').on(
      table.supplierId,
      table.fileId,
    ),
  ],
);

export const supplierFilesRelations = relations(supplierFiles, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierFiles.supplierId],
    references: [suppliers.id],
  }),
  file: one(files, {
    fields: [supplierFiles.fileId],
    references: [files.id],
  }),
}));

export type SupplierFileSelect = typeof supplierFiles.$inferSelect;
