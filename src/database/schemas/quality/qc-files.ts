import { relations } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { files } from '../files';
import { qcInspections } from './qc-inspections';

/**
 * Ảnh mẫu "Chi tiết IQC" có 2 bộ file riêng: bằng chứng kiểm tra và bằng chứng quyết định xử lý.
 * 1 bảng, discriminator `kind`, dùng chung cho cả `INCOMING` lẫn `OUTGOING` — trước gộp OQC không có
 * chỗ đính kèm, nay có miễn phí (`docs/decisions/qc-data-model.md`). Treo dưới `qc_inspections`
 * (lần kiểm cụ thể, không phải request) từ khi tách request/attempt
 * (`docs/decisions/qc-data-model.md`) — mỗi bộ file gắn đúng lần kiểm sinh ra nó, replace-
 * all không còn ý nghĩa (attempt append-only): `IqcService.confirmIqc`/`OqcService.confirmOqc` chỉ
 * insert bộ file cho attempt vừa tạo.
 */
export enum QcFileKind {
  QC_EVIDENCE = 'QC_EVIDENCE',
  DISPOSITION_EVIDENCE = 'DISPOSITION_EVIDENCE',
}

export const qcFileKindEnum = pgEnum('qc_file_kind', [
  QcFileKind.QC_EVIDENCE,
  QcFileKind.DISPOSITION_EVIDENCE,
]);

export const qcFiles = pgTable(
  'qc_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => qcInspections.id, { onDelete: 'cascade' }),
    // `restrict`, không `cascade` — khác `inspectionId` (con thật của attempt append-only), file là
    // bằng chứng QC đã confirm; xoá `files` không được kéo theo mất dấu vết, kể cả khi lần kiểm đã
    // `COMPLETED`. `FilesService.deleteFile`/`deleteFileById` phải tự kiểm trước khi xoá cứng.
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    kind: qcFileKindEnum('kind').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_qc_files_file_id').on(table.fileId),
    // Composite phủ luôn truy vấn chỉ lọc `inspectionId` (leftmost prefix) — không cần index đơn.
    index('idx_qc_files_inspection_id_kind').on(table.inspectionId, table.kind),
    // Chặn gắn trùng cùng một file vào cùng một lần kiểm/cùng bộ (kind).
    unique('uq_qc_files_inspection_file_kind').on(
      table.inspectionId,
      table.fileId,
      table.kind,
    ),
  ],
);

export const qcFilesRelations = relations(qcFiles, ({ one }) => ({
  inspection: one(qcInspections, {
    fields: [qcFiles.inspectionId],
    references: [qcInspections.id],
  }),
  file: one(files, {
    fields: [qcFiles.fileId],
    references: [files.id],
  }),
}));

export type QcFileSelect = typeof qcFiles.$inferSelect;
