import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { operations } from './products/operations';
import { products } from './products/products';
import { productionJobs } from './production-jobs';

export enum JobOperationStatus {
  Waiting = 'waiting',
  Processing = 'processing',
  Done = 'done',
  Blocked = 'blocked',
}

export const jobOperationStatusEnum = pgEnum('job_operation_status', [
  JobOperationStatus.Waiting,
  JobOperationStatus.Processing,
  JobOperationStatus.Done,
  JobOperationStatus.Blocked,
]);

/**
 * Snapshot routing của Job sản xuất.
 * Không đọc trực tiếp từ routing_steps sau khi Job đã tạo.
 * Job đã tạo phải giữ routing tại thời điểm sản xuất.
 */
export const jobOperations = pgTable('job_operations', {
  // ID công đoạn Job.
  id: uuid('id').defaultRandom().primaryKey(),
  // Job sản xuất.
  productionJobId: uuid('production_job_id')
    .notNull()
    .references(() => productionJobs.id, { onDelete: 'cascade' }),
  // Item sản xuất.
  itemId: uuid('item_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // Công đoạn.
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'restrict' }),
  // Thứ tự công đoạn.
  stepNo: integer('step_no').notNull(),
  // Số lượng kế hoạch.
  planQty: numeric('plan_qty', { precision: 18, scale: 3 }).notNull(),
  // Số lượng OK.
  okQty: numeric('ok_qty', { precision: 18, scale: 3 }).notNull().default('0'),
  // Số lượng NG.
  ngQty: numeric('ng_qty', { precision: 18, scale: 3 }).notNull().default('0'),
  // Trạng thái công đoạn.
  status: jobOperationStatusEnum('status').notNull().default(JobOperationStatus.Waiting),
  // Công đoạn gia công ngoài.
  isOutsideProcess: boolean('is_outside_process').notNull().default(false),
  // Ghi chú.
  note: text('note'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const jobOperationsRelations = relations(jobOperations, ({ one }) => ({
  productionJob: one(productionJobs, {
    fields: [jobOperations.productionJobId],
    references: [productionJobs.id],
  }),
  item: one(products, {
    fields: [jobOperations.itemId],
    references: [products.id],
  }),
  operation: one(operations, {
    fields: [jobOperations.operationId],
    references: [operations.id],
  }),
}));

export type JobOperation = typeof jobOperations.$inferSelect;
export type NewJobOperation = typeof jobOperations.$inferInsert;
