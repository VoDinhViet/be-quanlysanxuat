import { relations, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from '../identity-access/users';
import { qualityInspectionEvidences } from './quality-inspection-evidences';
import {
  IqcDisposition,
  OqcDisposition,
  qualityDispositionEnum,
  qualityInspectionDecisionEnum,
  qualityInspectionStatusEnum,
  qualityInspectionTypeEnum,
} from './quality-enums';
import { qualityInspections } from './quality-inspections';

/**
 * Rename của `qc_inspections` (attempt append-only) — đổi `qcRequestId→qualityInspectionId`,
 * `kind→inspectionType`, `inspectionDate→inspectedAt`, `result→decision`, `confirmedBy→inspectedBy`.
 * `disposition` giữ nguyên là cột enum (không FK — xem `quality-inspections.ts`). Mọi bất biến khác
 * (composite FK 3 cột mirror cha, `resultingStatus` thuần audit) kế thừa nguyên văn từ
 * `qc-inspections.ts`.
 */
export const qualityInspectionResults = pgTable(
  'quality_inspection_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Không dùng `.references()` — composite FK khai tường minh dưới constraint.
    qualityInspectionId: uuid('quality_inspection_id').notNull(),
    // Mirror của cha — không phải snapshot độc lập, composite FK dưới đảm bảo luôn khớp.
    inspectionType: qualityInspectionTypeEnum('inspection_type').notNull(),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),

    attemptNo: integer('attempt_no').notNull(),
    inspectedAt: timestamp('inspected_at').notNull(),

    decision: qualityInspectionDecisionEnum('decision').notNull(),
    decisionNote: varchar('decision_note', { length: 500 }),

    disposition: qualityDispositionEnum('disposition').$type<
      IqcDisposition | OqcDisposition
    >(),
    dispositionNote: varchar('disposition_note', { length: 500 }),
    sortOkQty: numeric('sort_ok_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }),
    sortNgQty: numeric('sort_ng_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }),

    // `status` mà quality_inspections nhận NGAY SAU attempt này — thuần audit, không phải nguồn cho
    // gate nào (gate đọc quality_inspections.status).
    resultingStatus: qualityInspectionStatusEnum('resulting_status').notNull(),

    inspectedBy: uuid('inspected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.qualityInspectionId,
        table.inspectionType,
        table.quantity,
      ],
      foreignColumns: [
        qualityInspections.id,
        qualityInspections.inspectionType,
        qualityInspections.quantity,
      ],
      name: 'fk_quality_inspection_results_inspection',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),

    uniqueIndex('uq_quality_inspection_results_inspection_attempt').on(
      table.qualityInspectionId,
      table.attemptNo,
    ),
    // (id, inspection_type) — cho supplier_returns.qualityInspectionResultId.
    uniqueIndex('uq_quality_inspection_results_id_type').on(
      table.id,
      table.inspectionType,
    ),
    index('idx_quality_inspection_results_decision').on(table.decision),
    index('idx_quality_inspection_results_disposition').on(table.disposition),
    index('idx_quality_inspection_results_inspected_by').on(table.inspectedBy),
    index('idx_quality_inspection_results_created_at').on(table.createdAt),

    check(
      'chk_quality_inspection_results_attempt_no_positive',
      sql`attempt_no > 0`,
    ),
    check(
      'chk_quality_inspection_results_quantity_positive',
      sql`quantity > 0`,
    ),
    check(
      'chk_quality_inspection_results_disposition_requires_fail',
      sql`disposition IS NULL OR decision = 'FAIL'`,
    ),
    check(
      'chk_quality_inspection_results_sort_qty_total',
      sql`sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity`,
    ),
    check(
      'chk_quality_inspection_results_sort_qty_pair',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0)`,
    ),
    check(
      'chk_quality_inspection_results_sort_qty_requires_sort',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT'`,
    ),
    check(
      'chk_quality_inspection_results_status_in_use',
      sql`resulting_status <> 'CANCELLED'`,
    ),
    check(
      'chk_quality_inspection_results_decision_in_use',
      sql`decision IN ('PASS','FAIL')`,
    ),
  ],
);

export const qualityInspectionResultsRelations = relations(
  qualityInspectionResults,
  ({ one, many }) => ({
    inspection: one(qualityInspections, {
      fields: [qualityInspectionResults.qualityInspectionId],
      references: [qualityInspections.id],
    }),
    evidences: many(qualityInspectionEvidences),
    inspectorBy: one(users, {
      fields: [qualityInspectionResults.inspectedBy],
      references: [users.id],
    }),
  }),
);

export type QualityInspectionResultSelect =
  typeof qualityInspectionResults.$inferSelect;
