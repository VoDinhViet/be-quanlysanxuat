import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { qualityInspections } from './quality-inspections';

/**
 * Ảnh mẫu "Chi tiết IQC" có 2 bộ file riêng: bằng chứng kiểm tra và bằng chứng quyết định xử lý.
 * 1 bảng, discriminator `kind`, dùng chung cho cả `INCOMING` lẫn `OUTGOING`
 * (`qualityInspections.kind`) — trước gộp OQC không có chỗ đính kèm, nay có miễn phí
 * (`docs/decisions/qc-single-table.md`). Replace-all theo `(inspectionId, kind)` — 2 bộ độc lập
 * nhau, `IqcService.confirmIqc` xoá sạch bộ `DISPOSITION_EVIDENCE` khi lưu lại với `result = PASS`.
 */
export enum IqcAttachmentKind {
  QC_EVIDENCE = 'QC_EVIDENCE',
  DISPOSITION_EVIDENCE = 'DISPOSITION_EVIDENCE',
}

export const iqcAttachmentKindEnum = pgEnum('iqc_attachment_kind', [
  IqcAttachmentKind.QC_EVIDENCE,
  IqcAttachmentKind.DISPOSITION_EVIDENCE,
]);

export const qcAttachments = pgTable(
  'qc_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => qualityInspections.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    kind: iqcAttachmentKindEnum('kind').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_qc_attachments_file_id').on(table.fileId),
    // Composite phủ luôn truy vấn chỉ lọc `inspectionId` (leftmost prefix) — không cần index đơn.
    index('idx_qc_attachments_inspection_id_kind').on(
      table.inspectionId,
      table.kind,
    ),
  ],
);

export const qcAttachmentsRelations = relations(qcAttachments, ({ one }) => ({
  inspection: one(qualityInspections, {
    fields: [qcAttachments.inspectionId],
    references: [qualityInspections.id],
  }),
  file: one(files, {
    fields: [qcAttachments.fileId],
    references: [files.id],
  }),
}));

export type QcAttachmentSelect = typeof qcAttachments.$inferSelect;
