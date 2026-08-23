import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from '../identity-access/users';
import { qcInspectionLevelEnum } from './qc-requests';
import { qcAqlRules } from './qc-aql-rules';

/**
 * Bộ phương án lấy mẫu AQL — thay hardcode `LOT_SIZE_CODE_LETTER`/`SAMPLING_PLAN` ở
 * `src/api/iqc/iqc-aql.constant.ts`, sửa được không cần deploy code. Một plan = một cặp
 * (inspection level, AQL level) của một tiêu chuẩn; các dải lot size nằm ở `qc_aql_rules`.
 */
export const qcAqlPlans = pgTable(
  'qc_aql_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    standard: varchar('standard', { length: 100 }).notNull(),
    inspectionLevel: qcInspectionLevelEnum('inspection_level').notNull(),
    aqlLevel: numeric('aql_level', {
      precision: 4,
      scale: 2,
      mode: 'number',
    }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    note: varchar('note', { length: 500 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_qc_aql_plans_is_active').on(table.isActive),
    // Ràng buộc thật (không phải index hiệu năng): resolveAqlPlan tra theo (level, aql), tối đa 1
    // plan active cho mỗi cặp.
    uniqueIndex('uq_qc_aql_plans_level_aql_active')
      .on(table.inspectionLevel, table.aqlLevel)
      .where(sql`is_active`),
    check('chk_qc_aql_plans_aql_level_positive', sql`aql_level > 0`),
  ],
);

export const qcAqlPlansRelations = relations(qcAqlPlans, ({ many }) => ({
  rules: many(qcAqlRules),
}));

export type QcAqlPlanSelect = typeof qcAqlPlans.$inferSelect;
