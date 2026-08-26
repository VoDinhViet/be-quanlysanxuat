import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { productionJobOperationReports } from './production-job-operation-reports';

/**
 * Ảnh đính kèm của một lần báo cáo (`production_job_operation_reports`) — nhiều ảnh/lần, cùng
 * khuôn `qc_files` (`src/database/schemas/quality/qc-files.ts`). `fileId` dùng `restrict` (không
 * `cascade`) — ảnh là bằng chứng đã báo cáo, xoá `files` không được kéo theo mất dấu vết.
 */
export const productionJobOperationReportFiles = pgTable(
  'production_job_operation_report_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => productionJobOperationReports.id, {
        onDelete: 'cascade',
      }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_production_job_operation_report_files_report_id').on(
      table.reportId,
    ),
    index('idx_production_job_operation_report_files_file_id').on(table.fileId),
  ],
);

export const productionJobOperationReportFilesRelations = relations(
  productionJobOperationReportFiles,
  ({ one }) => ({
    report: one(productionJobOperationReports, {
      fields: [productionJobOperationReportFiles.reportId],
      references: [productionJobOperationReports.id],
    }),
    file: one(files, {
      fields: [productionJobOperationReportFiles.fileId],
      references: [files.id],
    }),
  }),
);

export type ProductionJobOperationReportFileSelect =
  typeof productionJobOperationReportFiles.$inferSelect;
