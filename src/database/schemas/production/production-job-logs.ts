import { relations } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { productionJobs } from './production-jobs';
import { users } from '../identity-access/users';

/** `CREATED`/`STARTED` thay cho `PENDING`/`IN_PROGRESS` vì log ghi hành động, không ghi trạng
 * thái đích. */
export enum ProductionJobLogAction {
  CREATED = 'CREATED',
  STARTED = 'STARTED',
  WAITING_QC = 'WAITING_QC',
  WAITING_DELIVERY = 'WAITING_DELIVERY',
  COMPLETED = 'COMPLETED',
  ITEMS_EDITED = 'ITEMS_EDITED',
}

export const productionJobLogActionEnum = pgEnum('production_job_log_action', [
  ProductionJobLogAction.CREATED,
  ProductionJobLogAction.STARTED,
  ProductionJobLogAction.WAITING_QC,
  ProductionJobLogAction.WAITING_DELIVERY,
  ProductionJobLogAction.COMPLETED,
  ProductionJobLogAction.ITEMS_EDITED,
]);

/**
 * Lịch sử thao tác trên một Job — cùng khuôn `production_order_logs`, append-only (không
 * `updatedAt`). Mọi mốc ghi bằng `tx.insert` thẳng trong transaction của hành động đang log, rải
 * ở nhiều nơi (`production-jobs.service.ts`/`.query.ts`, `production-job-issues.query.ts`,
 * `oqc.query.ts`, `inventory-receipts.service.ts`), không gom về một service chung để tránh vòng
 * import DI. `performedBy` NULL có chủ đích ở `WAITING_QC`/`WAITING_DELIVERY`: hai mốc tự động,
 * `production_jobs` cũng không có cột `*By`/`*At` cho chúng.
 */
export const productionJobLogs = pgTable(
  'production_job_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    action: productionJobLogActionEnum('action').notNull(),
    content: varchar('content', { length: 1000 }).notNull(),
    performedBy: uuid('performed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_production_job_logs_production_job_id').on(
      table.productionJobId,
    ),
    index('idx_production_job_logs_performed_by').on(table.performedBy),
  ],
);

export const productionJobLogsRelations = relations(
  productionJobLogs,
  ({ one }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobLogs.productionJobId],
      references: [productionJobs.id],
    }),
    performerBy: one(users, {
      fields: [productionJobLogs.performedBy],
      references: [users.id],
    }),
  }),
);

export type ProductionJobLogSelect = typeof productionJobLogs.$inferSelect;
