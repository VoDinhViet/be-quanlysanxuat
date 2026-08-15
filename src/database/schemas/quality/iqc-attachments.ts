import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { iqcInspections } from './iqc-inspections';

/**
 * Ảnh mẫu "Chi tiết IQC" có 2 bộ file riêng: bằng chứng kiểm tra (mục 4) và bằng chứng quyết
 * định xử lý (mục 6). 1 bảng, discriminator `kind`, thay vì 2 bảng gần như y hệt nhau —
 * `order_attachments`/`supplier_attachments` đã là 2 bản trùng lặp, không nhân thêm bản thứ 3/4.
 * Replace-all theo `(iqcId, kind)` — 2 bộ độc lập nhau, `IqcService.confirmIqc` xoá sạch bộ
 * DISPOSITION_EVIDENCE khi lưu lại với `result = PASS`.
 */
export enum IqcAttachmentKind {
  QC_EVIDENCE = 'QC_EVIDENCE',
  DISPOSITION_EVIDENCE = 'DISPOSITION_EVIDENCE',
}

export const iqcAttachmentKindEnum = pgEnum('iqc_attachment_kind', [
  IqcAttachmentKind.QC_EVIDENCE,
  IqcAttachmentKind.DISPOSITION_EVIDENCE,
]);

export const iqcAttachments = pgTable(
  'iqc_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    iqcId: uuid('iqc_id')
      .notNull()
      .references(() => iqcInspections.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    kind: iqcAttachmentKindEnum('kind').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_iqc_attachments_iqc_id').on(table.iqcId),
    index('idx_iqc_attachments_file_id').on(table.fileId),
    index('idx_iqc_attachments_iqc_id_kind').on(table.iqcId, table.kind),
  ],
);

export const iqcAttachmentsRelations = relations(iqcAttachments, ({ one }) => ({
  iqc: one(iqcInspections, {
    fields: [iqcAttachments.iqcId],
    references: [iqcInspections.id],
  }),
  file: one(files, {
    fields: [iqcAttachments.fileId],
    references: [files.id],
  }),
}));

export type IqcAttachmentSelect = typeof iqcAttachments.$inferSelect;
