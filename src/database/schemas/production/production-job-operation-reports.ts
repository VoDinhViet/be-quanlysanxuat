import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from '../identity-access/users';
import { productionJobOperationReportFiles } from './production-job-operation-report-files';
import { productionJobOperations } from './production-job-operations';

/**
 * Nhật ký báo cáo hoàn thành **từng lần** của một công đoạn (`production_job_operations`),
 * append-only — ghi bởi `ProductionExecutionService.createJobOperationReport`. Business rule (cộng
 * dồn, vì sao có thể lệch cột cộng dồn): `docs/domains/production.md`.
 *
 * Rules:
 * - `completedQuantityDelta`/`rejectedQuantityDelta` là số **cộng thêm** của riêng lần báo cáo
 *   này, không phải giá trị tuyệt đối — khác hẳn `production_job_operations.completedQuantity`/
 *   `rejectedQuantity` (giá trị cộng dồn tại thời điểm đọc).
 */
export const productionJobOperationReports = pgTable(
  'production_job_operation_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobOperationId: uuid('production_job_operation_id')
      .notNull()
      .references(() => productionJobOperations.id, { onDelete: 'cascade' }),
    completedQuantityDelta: numeric('completed_quantity_delta', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    rejectedQuantityDelta: numeric('rejected_quantity_delta', {
      precision: 12,
      scale: 3,
      mode: 'number',
    })
      .notNull()
      .default(0),
    completedDate: date('completed_date', { mode: 'date' }).notNull(),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index(
      'idx_production_job_operation_reports_production_job_operation_id',
    ).on(table.productionJobOperationId),
    index('idx_production_job_operation_reports_created_by').on(
      table.createdBy,
    ),
    check(
      'chk_production_job_operation_reports_completed_quantity_delta_non_negative',
      sql`completed_quantity_delta >= 0`,
    ),
    check(
      'chk_production_job_operation_reports_rejected_quantity_delta_non_negative',
      sql`rejected_quantity_delta >= 0`,
    ),
  ],
);

export const productionJobOperationReportsRelations = relations(
  productionJobOperationReports,
  ({ one, many }) => ({
    productionJobOperation: one(productionJobOperations, {
      fields: [productionJobOperationReports.productionJobOperationId],
      references: [productionJobOperations.id],
    }),
    creatorBy: one(users, {
      fields: [productionJobOperationReports.createdBy],
      references: [users.id],
    }),
    files: many(productionJobOperationReportFiles),
  }),
);

export type ProductionJobOperationReportSelect =
  typeof productionJobOperationReports.$inferSelect;
