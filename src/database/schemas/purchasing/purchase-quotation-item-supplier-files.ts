import { relations } from 'drizzle-orm';
import { index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { purchaseQuotationItemSuppliers } from './purchase-quotation-item-suppliers';

/**
 * Join table: tệp đính kèm (catalogue, chứng chỉ, bảng giá PDF, ảnh mẫu) cho một dòng NCC
 * trong phiếu báo giá. Pattern giống `item_files` / `supplier_files` — bytes lưu trên `files`,
 * entity chỉ giữ FK.
 */
export const purchaseQuotationItemSupplierFiles = pgTable(
  'purchase_quotation_item_supplier_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationItemSupplierId: uuid('quotation_item_supplier_id')
      .notNull()
      .references(() => purchaseQuotationItemSuppliers.id, {
        onDelete: 'cascade',
      }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index(
      'idx_purchase_quotation_item_supplier_files_supplier_id',
    ).on(table.quotationItemSupplierId),
    index('idx_purchase_quotation_item_supplier_files_file_id').on(
      table.fileId,
    ),
    unique('uq_purchase_quotation_item_supplier_files').on(
      table.quotationItemSupplierId,
      table.fileId,
    ),
  ],
);

export const purchaseQuotationItemSupplierFilesRelations = relations(
  purchaseQuotationItemSupplierFiles,
  ({ one }) => ({
    quotationItemSupplier: one(purchaseQuotationItemSuppliers, {
      fields: [purchaseQuotationItemSupplierFiles.quotationItemSupplierId],
      references: [purchaseQuotationItemSuppliers.id],
    }),
    file: one(files, {
      fields: [purchaseQuotationItemSupplierFiles.fileId],
      references: [files.id],
    }),
  }),
);

export type PurchaseQuotationItemSupplierFileSelect =
  typeof purchaseQuotationItemSupplierFiles.$inferSelect;
