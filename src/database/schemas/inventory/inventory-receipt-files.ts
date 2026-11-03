import { relations } from 'drizzle-orm';
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { files } from '../files';
import { inventoryReceipts } from './inventory-receipts';

/**
 * Ảnh/file đính kèm của phiếu nhập kho; thêm/bớt được ở mọi trạng thái trừ `CANCELLED`.
 *
 * Rules:
 * - Tách khỏi `quality_inspection_evidences`: đó là bằng chứng của lần kiểm IQC, còn bảng này là
 *   chứng từ của chính phiếu nhập.
 * - `fileId` dùng `restrict`: xoá `files` không được kéo theo mất dấu vết chứng từ.
 * - Bỏ file khỏi phiếu chỉ xoá dòng nối, không xoá file trong kho lưu trữ.
 */
export const inventoryReceiptFiles = pgTable(
  'inventory_receipt_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => inventoryReceipts.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_inventory_receipt_files_receipt_file').on(
      table.receiptId,
      table.fileId,
    ),
    index('idx_inventory_receipt_files_file_id').on(table.fileId),
  ],
);

export const inventoryReceiptFilesRelations = relations(
  inventoryReceiptFiles,
  ({ one }) => ({
    receipt: one(inventoryReceipts, {
      fields: [inventoryReceiptFiles.receiptId],
      references: [inventoryReceipts.id],
    }),
    file: one(files, {
      fields: [inventoryReceiptFiles.fileId],
      references: [files.id],
    }),
  }),
);

export type InventoryReceiptFileSelect =
  typeof inventoryReceiptFiles.$inferSelect;
