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
 * `bomItemId`) trong transaction duyệt LSX (`ProductionJobsService.createJobs`). Đóng băng, không
 * có route sửa — sửa routing/`operations` gốc sau đó không ảnh hưởng Job đã duyệt. Công đoạn Cấp 0
 * của chính FG (lắp ráp/đóng gói) **cũng snapshot ở đây** — copy từ `routings`/`routing_operations`
 * của FG, gắn vào node `production_job_bom_items.itemType = 'FG'` (xem doc comment bảng đó và
 * `docs/decisions/oqc-per-operation.md` mục "Đừng hoàn lại") — không phải một bảng riêng.
 *
 * Rules:
 * - `code`/`name`/`type` (của công đoạn) là **snapshot text**, nguồn hiển thị chính — đóng băng
 *   lúc duyệt, độc lập `operations` sống. `operationId` chỉ còn là liên kết tham khảo (`set null`
 *   khi bị xoá).
 * - Không unique `(productionJobBomItemId, operationId)` — một routing được phép lặp lại cùng
 *   công đoạn (`bom_operations` cũng vậy), ép unique sẽ nuốt mất bước khi copy.
 * - `code`/`name`/`type`/`sortOrder`/`note`/`operationId` vẫn đóng băng lúc duyệt.
 *   `completedQuantity`/`rejectedQuantity`/`completedDate` sửa được qua hai đường: `PATCH
 *   .../operations/:operationId` (ghi đè, `ProductionJobsService`) hoặc `POST
 *   .../reports` (cộng dồn, `ProductionExecutionService`, ghi thêm một dòng
 *   `production_job_operation_reports`) — cả hai chỉ chạy khi `operationsApprovedAt` đã có (`E250`).
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
