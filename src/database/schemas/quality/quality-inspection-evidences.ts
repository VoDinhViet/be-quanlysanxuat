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
import { qualityInspectionResults } from './quality-inspection-results';

/**
 * Rename của `qc_files` — treo dưới `quality_inspection_results` (đổi từ `qc_inspections`), mọi bất
 * biến khác (2 bộ file `QC_EVIDENCE`/`DISPOSITION_EVIDENCE`, `fileId` restrict để giữ vết) kế thừa
 * nguyên văn từ `qc-files.ts`.
 */
export enum QualityEvidenceKind {
  QC_EVIDENCE = 'QC_EVIDENCE',
  DISPOSITION_EVIDENCE = 'DISPOSITION_EVIDENCE',
}

export const qualityEvidenceKindEnum = pgEnum('quality_evidence_kind', [
  QualityEvidenceKind.QC_EVIDENCE,
  QualityEvidenceKind.DISPOSITION_EVIDENCE,
]);

export const qualityInspectionEvidences = pgTable(
  'quality_inspection_evidences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    qualityInspectionResultId: uuid('quality_inspection_result_id')
      .notNull()
      .references(() => qualityInspectionResults.id, { onDelete: 'cascade' }),
    // `restrict`, không `cascade` — file là bằng chứng QC đã confirm, xoá `files` không được kéo
    // theo mất dấu vết. `FilesService.deleteFile`/`deleteFileById` phải tự kiểm trước khi xoá cứng.
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    kind: qualityEvidenceKindEnum('kind').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_quality_inspection_evidences_file_id').on(table.fileId),
    index('idx_quality_inspection_evidences_result_id_kind').on(
      table.qualityInspectionResultId,
      table.kind,
    ),
    unique('uq_quality_inspection_evidences_result_file_kind').on(
      table.qualityInspectionResultId,
      table.fileId,
      table.kind,
    ),
  ],
);

export const qualityInspectionEvidencesRelations = relations(
  qualityInspectionEvidences,
  ({ one }) => ({
    result: one(qualityInspectionResults, {
      fields: [qualityInspectionEvidences.qualityInspectionResultId],
      references: [qualityInspectionResults.id],
    }),
    file: one(files, {
      fields: [qualityInspectionEvidences.fileId],
      references: [files.id],
    }),
  }),
);

export type QualityInspectionEvidenceSelect =
  typeof qualityInspectionEvidences.$inferSelect;
