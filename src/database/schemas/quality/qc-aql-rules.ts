import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { qcAqlPlans } from './qc-aql-plans';

/**
 * Một dải lot size của một `qc_aql_plans` — mã hoá đúng một hàng bảng II-A (code letter × AQL →
 * sample size/Ac/Re) đã gộp theo dải lot size liền kề cùng code letter, thay hardcode
 * `SAMPLING_PLAN` cũ ở `src/api/iqc/iqc-aql.constant.ts`. `lotSizeMax = NULL` nghĩa là vô cực (hàng
 * cuối bảng gốc). Ô nào bảng giấy gốc dùng mũi tên (đổi cỡ mẫu sang code letter khác) thì không có
 * rule nào ở đây — giữ nguyên hành vi "tra hụt, QC nhập tay" của bản hardcode.
 */
export const qcAqlRules = pgTable(
  'qc_aql_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    aqlPlanId: uuid('aql_plan_id')
      .notNull()
      .references(() => qcAqlPlans.id, { onDelete: 'cascade' }),
    codeLetter: varchar('code_letter', { length: 2 }).notNull(),
    lotSizeMin: integer('lot_size_min').notNull(),
    lotSizeMax: integer('lot_size_max'),
    sampleSize: integer('sample_size').notNull(),
    acceptanceNumber: integer('acceptance_number').notNull(),
    rejectionNumber: integer('rejection_number').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Không chặn được 2 rule chồng dải lot size bằng DDL (cần EXCLUDE USING gist, drizzle-orm chưa
    // có builder) — service validate overlap lúc ghi, unique này chỉ chặn trùng đúng điểm bắt đầu.
    uniqueIndex('uq_qc_aql_rules_plan_lot_min').on(
      table.aqlPlanId,
      table.lotSizeMin,
    ),
    index('idx_qc_aql_rules_plan_id_lot_max').on(
      table.aqlPlanId,
      table.lotSizeMax,
    ),
    check('chk_qc_aql_rules_lot_size_min_positive', sql`lot_size_min >= 1`),
    check(
      'chk_qc_aql_rules_lot_size_range',
      sql`lot_size_max IS NULL OR lot_size_max >= lot_size_min`,
    ),
    check('chk_qc_aql_rules_sample_size_positive', sql`sample_size > 0`),
    check('chk_qc_aql_rules_ac_non_negative', sql`acceptance_number >= 0`),
    check(
      'chk_qc_aql_rules_re_gt_ac',
      sql`rejection_number > acceptance_number`,
    ),
  ],
);

export const qcAqlRulesRelations = relations(qcAqlRules, ({ one }) => ({
  plan: one(qcAqlPlans, {
    fields: [qcAqlRules.aqlPlanId],
    references: [qcAqlPlans.id],
  }),
}));

export type QcAqlRuleSelect = typeof qcAqlRules.$inferSelect;
