import { relations } from 'drizzle-orm';
import { date, numeric, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { jobOperations } from './job-operations';
import { orderItems } from './orders';
import { productRevisions, products } from './products';
import { workOrders } from './workOrders';

export enum ProductionJobStatus {
  Waiting = 'waiting',
  Processing = 'processing',
  WaitingQc = 'waiting_qc',
  WaitingDelivery = 'waiting_delivery',
  Completed = 'completed',
}

export const productionJobStatusEnum = pgEnum('production_job_status', [
  ProductionJobStatus.Waiting,
  ProductionJobStatus.Processing,
  ProductionJobStatus.WaitingQc,
  ProductionJobStatus.WaitingDelivery,
  ProductionJobStatus.Completed,
]);

export const productionJobs = pgTable('production_jobs', {
  // ID Job.
  id: uuid('id').defaultRandom().primaryKey(),
  // Mã Job.
  jobNo: varchar('job_no', { length: 50 }).notNull(),
  // LSX.
  workOrderId: uuid('work_order_id')
    .notNull()
    .references(() => workOrders.id, { onDelete: 'restrict' }),
  // Dòng PO.
  orderItemId: uuid('order_item_id')
    .notNull()
    .references(() => orderItems.id, { onDelete: 'restrict' }),
  // Sản phẩm.
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // Phiên bản sản phẩm.
  productRevisionId: uuid('product_revision_id')
    .notNull()
    .references(() => productRevisions.id, { onDelete: 'restrict' }),
  // Số lượng kế hoạch.
  plannedQty: numeric('planned_qty', { precision: 18, scale: 3 }).notNull(),
  // Số lượng OK cuối.
  okQty: numeric('ok_qty', { precision: 18, scale: 3 }).notNull().default('0'),
  // Số lượng NG.
  ngQty: numeric('ng_qty', { precision: 18, scale: 3 }).notNull().default('0'),
  // Hạn giao.
  dueDate: date('due_date').notNull(),
  // Trạng thái Job.
  status: productionJobStatusEnum('status').notNull().default(ProductionJobStatus.Waiting),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const productionJobsRelations = relations(productionJobs, ({ one, many }) => ({
  workOrder: one(workOrders, {
    fields: [productionJobs.workOrderId],
    references: [workOrders.id],
  }),
  orderItem: one(orderItems, {
    fields: [productionJobs.orderItemId],
    references: [orderItems.id],
  }),
  product: one(products, {
    fields: [productionJobs.productId],
    references: [products.id],
  }),
  productRevision: one(productRevisions, {
    fields: [productionJobs.productRevisionId],
    references: [productRevisions.id],
  }),
  // production_jobs 1-n job_operations.
  operations: many(jobOperations),
}));

export type ProductionJob = typeof productionJobs.$inferSelect;
export type NewProductionJob = typeof productionJobs.$inferInsert;
