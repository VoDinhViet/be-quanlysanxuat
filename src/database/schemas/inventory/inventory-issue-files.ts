import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { inventoryIssues } from './inventory-issues';

/**
 * Ảnh/file bằng chứng lúc kho xác nhận xuất (`post`) một phiếu xuất kho — cùng khuôn
 * `supplier_return_files`. `fileId` dùng `restrict`: bằng chứng người lãnh đã nhận hàng, xoá
 * `files` không được kéo theo mất dấu vết.
 */
export const inventoryIssueFiles = pgTable(
  'inventory_issue_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => inventoryIssues.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_inventory_issue_files_issue_id').on(table.issueId),
    index('idx_inventory_issue_files_file_id').on(table.fileId),
  ],
);

export const inventoryIssueFilesRelations = relations(
  inventoryIssueFiles,
  ({ one }) => ({
    issue: one(inventoryIssues, {
      fields: [inventoryIssueFiles.issueId],
      references: [inventoryIssues.id],
    }),
    file: one(files, {
      fields: [inventoryIssueFiles.fileId],
      references: [files.id],
    }),
  }),
);

export type InventoryIssueFileSelect = typeof inventoryIssueFiles.$inferSelect;
