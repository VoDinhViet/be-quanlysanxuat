import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { operationTypeEnum, operations } from '../operations';
import { productionJobBomItems } from './production-job-bom-items';
import { productionJobOperationReports } from './production-job-operation-reports';
import { productionJobs } from './production-jobs';

/**
 * Snapshot công đoạn as-used của từng node BOM trong một Job — copy `bom_operations` (khoá theo
 * `bomItemId`). Dựng lúc tạo Job (`createJobs` → `createJobSnapshot`) hoặc chụp lại khi Job còn
 * `PENDING`; sửa routing/`operations` gốc sau đó không ảnh hưởng Job. Công đoạn Cấp 0 của chính FG
 * copy từ `routing_operations` và gắn vào node `production_job_bom_items.itemType = 'FG'`.
 *
 * Rules:
 * - `code`/`name`/`type` là **snapshot text**, nguồn hiển thị chính, độc lập `operations` sống.
 *   `operationId` chỉ là liên kết tham khảo (`set null` khi bị xoá).
 * - Không unique `(productionJobBomItemId, operationId)`: một routing được lặp lại cùng công đoạn
 *   (`bom_operations` cũng vậy), ép unique sẽ nuốt mất bước khi copy.
 * - `completedQuantity`/`rejectedQuantity`/`completedDate` chỉ sửa tay qua `POST .../reports`
 *   (`ProductionExecutionService`, cộng dồn và ghi thêm một dòng `production_job_operation_reports`;
 *   chỉ khi Job `IN_PROGRESS`, `E087`). Công đoạn `OUTSOURCE` bị chặn ở đó (`E260`), tự ghi qua
 *   `recomputeOutsourcedOperationProgress` khi OS-IN post/cancel.
 * - `dueDate` là cột kế hoạch điều độ, sửa qua `PATCH .../due-date` và `PATCH .../operations/plan`
 *   (`ProductionJobsService`): ghi đè thẳng, chỉ khi Job `IN_PROGRESS` (`E087`), không phân biệt
 *   `OUTSOURCE` vì không phải số liệu OS-IN tự ghi.
 */
export const productionJobOperations = pgTable(
  'production_job_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    productionJobBomItemId: uuid('production_job_bom_item_id')
      .notNull()
      .references(() => productionJobBomItems.id, { onDelete: 'cascade' }),
    operationId: uuid('operation_id').references(() => operations.id, {
      onDelete: 'set null',
    }),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: operationTypeEnum('type').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 1000 }),
    completedQuantity: numeric('completed_quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    })
      .notNull()
      .default(0),
    rejectedQuantity: numeric('rejected_quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    })
      .notNull()
      .default(0),
    completedDate: date('completed_date', { mode: 'date' }),
    // Thời điểm server ghi lần báo cáo/cập nhật tiến độ gần nhất; null = chưa từng cập nhật.
    lastReportedAt: timestamp('last_reported_at'),
    dueDate: date('due_date', { mode: 'date' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_production_job_operations_production_job_id').on(
      table.productionJobId,
    ),
    index('idx_production_job_operations_production_job_bom_item_id').on(
      table.productionJobBomItemId,
    ),
    index('idx_production_job_operations_operation_id').on(table.operationId),
    check(
      'chk_production_job_operations_completed_quantity_non_negative',
      sql`completed_quantity >= 0`,
    ),
    check(
      'chk_production_job_operations_rejected_quantity_non_negative',
      sql`rejected_quantity >= 0`,
    ),
  ],
);

export const productionJobOperationsRelations = relations(
  productionJobOperations,
  ({ one, many }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobOperations.productionJobId],
      references: [productionJobs.id],
    }),
    bomItem: one(productionJobBomItems, {
      fields: [productionJobOperations.productionJobBomItemId],
      references: [productionJobBomItems.id],
    }),
    reports: many(productionJobOperationReports),
  }),
);

export type ProductionJobOperationSelect =
  typeof productionJobOperations.$inferSelect;
