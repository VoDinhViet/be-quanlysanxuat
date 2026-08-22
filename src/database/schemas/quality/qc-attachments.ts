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
 * chỗ đính kèm, nay có miễn phí (`docs/decisions/qc-single-table.md`). Treo dưới `qc_inspections`
 * (lần kiểm cụ thể, không phải request) từ khi tách request/attempt
 * (`docs/decisions/qc-request-attempt-split.md`) — mỗi bộ file gắn đúng lần kiểm sinh ra nó, replace-
 * all không còn ý nghĩa (attempt append-only): `IqcService.confirmIqc`/`OqcService.confirmOqc` chỉ
 * insert bộ file cho attempt vừa tạo.
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
      .references(() => qcInspections.id, { onDelete: 'cascade' }),
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
    // Chặn gắn trùng cùng một file vào cùng một lần kiểm/cùng bộ (kind).
    unique('uq_qc_attachments_inspection_file_kind').on(
      table.inspectionId,
      table.fileId,
      table.kind,
    ),
  ],
);

export const qcAttachmentsRelations = relations(qcAttachments, ({ one }) => ({
  inspection: one(qcInspections, {
    fields: [qcAttachments.inspectionId],
    references: [qcInspections.id],
  }),
  file: one(files, {
    fields: [qcAttachments.fileId],
    references: [files.id],
  }),
}));

export type QcAttachmentSelect = typeof qcAttachments.$inferSelect;
