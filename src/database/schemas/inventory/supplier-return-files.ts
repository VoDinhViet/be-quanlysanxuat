import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { supplierReturns } from './supplier-returns';

/**
 * File đính kèm lúc xác nhận xuất trả (`post`) của một phiếu trả NCC — nhiều file/phiếu, cùng
 * khuôn `production_job_operation_report_files` (không có cột `kind`, chỉ một mục đích duy nhất).
 * `fileId` dùng `restrict` (không `cascade`) — file là bằng chứng đã xuất trả, xoá `files` không
 * được kéo theo mất dấu vết.
 */
export const supplierReturnFiles = pgTable(
  'supplier_return_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierReturnId: uuid('supplier_return_id')
      .notNull()
      .references(() => supplierReturns.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_supplier_return_files_supplier_return_id').on(
      table.supplierReturnId,
    ),
    index('idx_supplier_return_files_file_id').on(table.fileId),
  ],
);

export const supplierReturnFilesRelations = relations(
  supplierReturnFiles,
  ({ one }) => ({
    supplierReturn: one(supplierReturns, {
      fields: [supplierReturnFiles.supplierReturnId],
      references: [supplierReturns.id],
    }),
    file: one(files, {
      fields: [supplierReturnFiles.fileId],
      references: [files.id],
    }),
  }),
);

export type SupplierReturnFileSelect = typeof supplierReturnFiles.$inferSelect;
