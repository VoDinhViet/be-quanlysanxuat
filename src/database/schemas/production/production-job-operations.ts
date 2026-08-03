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
import { productionJobs } from './production-jobs';

/**
 * Snapshot công đoạn as-used của từng node BOM trong một Job — copy `routing_steps` (khoá theo
 * `bomItemId`) trong transaction duyệt LSX (`ProductionJobsService.createJobs`). Đóng băng, không
 * có route sửa — sửa routing/`operations` gốc sau đó không ảnh hưởng Job đã duyệt. Không có khái
 * niệm Cấp 0 riêng ở tầng Job — công đoạn của chính FG đọc qua `job.productId`, không snapshot ở
 * đây.
 *
 * Rules:
 * - `code`/`name`/`type` (của công đoạn) là **snapshot text**, nguồn hiển thị chính — đóng băng
 *   lúc duyệt, độc lập `operations` sống. `operationId` chỉ còn là liên kết tham khảo (`set null`
 *   khi bị xoá).
 * - Không unique `(productionJobBomItemId, operationId)` — một routing được phép lặp lại cùng
 *   công đoạn (`routing_steps` cũng vậy), ép unique sẽ nuốt mất bước khi copy.
 * - `code`/`name`/`type`/`sortOrder`/`note`/`operationId` vẫn đóng băng lúc duyệt. `completedQuantity`/
 *   `completedDate` là 2 cột duy nhất sửa được sau đó, qua
 *   `ProductionJobsService.updateProductionJobOperation` (`PATCH .../operations/:operationId`).
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
  ],
);

export const productionJobOperationsRelations = relations(
  productionJobOperations,
  ({ one }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobOperations.productionJobId],
      references: [productionJobs.id],
    }),
    bomItem: one(productionJobBomItems, {
      fields: [productionJobOperations.productionJobBomItemId],
      references: [productionJobBomItems.id],
    }),
  }),
);
