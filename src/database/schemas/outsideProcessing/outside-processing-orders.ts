import { relations } from 'drizzle-orm';
import {
  date,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { jobOperations } from '../job-operations';
import { operations } from '../products/operations';
import { products } from '../products/products';
import { productionJobs } from '../production-jobs';
import { suppliers } from '../suppliers';
import { outsideProcessingReceipts } from './outside-processing-receipts';

export enum OutsideProcessingOrderStatus {
  Draft = 'draft',
  Sent = 'sent',
  WaitingQc = 'waiting_qc',
  PartialReceived = 'partial_received',
  Completed = 'completed',
}

export const outsideProcessingOrderStatusEnum = pgEnum('outside_processing_order_status', [
  OutsideProcessingOrderStatus.Draft,
  OutsideProcessingOrderStatus.Sent,
  OutsideProcessingOrderStatus.WaitingQc,
  OutsideProcessingOrderStatus.PartialReceived,
  OutsideProcessingOrderStatus.Completed,
]);

/**
 * Phiếu gửi gia công ngoài OS-OUT.
 */
export const outsideProcessingOrders = pgTable('outside_processing_orders', {
  // ID phiếu PGCN.
  id: uuid('id').defaultRandom().primaryKey(),
  // Mã PGCN.
  code: varchar('code', { length: 50 }).notNull(),
  // Job sản xuất.
  productionJobId: uuid('production_job_id')
    .notNull()
    .references(() => productionJobs.id, { onDelete: 'restrict' }),
  // Công đoạn Job.
  jobOperationId: uuid('job_operation_id')
    .notNull()
    .references(() => jobOperations.id, { onDelete: 'restrict' }),
  // Part gửi gia công.
  itemId: uuid('item_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // Công đoạn.
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'restrict' }),
  // Nhà cung cấp.
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'restrict' }),
  // Số lượng gửi.
  qtySent: numeric('qty_sent', { precision: 18, scale: 3 }).notNull(),
  // Số lượng đã về.
  qtyReceived: numeric('qty_received', { precision: 18, scale: 3 }).notNull().default('0'),
  // Trạng thái phiếu.
  status: outsideProcessingOrderStatusEnum('status')
    .notNull()
    .default(OutsideProcessingOrderStatus.Draft),
  // Ngày gửi.
  sentDate: date('sent_date'),
  // Ghi chú.
  note: text('note'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const outsideProcessingOrdersRelations = relations(
  outsideProcessingOrders,
  ({ one, many }) => ({
    productionJob: one(productionJobs, {
      fields: [outsideProcessingOrders.productionJobId],
      references: [productionJobs.id],
    }),
    jobOperation: one(jobOperations, {
      fields: [outsideProcessingOrders.jobOperationId],
      references: [jobOperations.id],
    }),
    item: one(products, {
      fields: [outsideProcessingOrders.itemId],
      references: [products.id],
    }),
    operation: one(operations, {
      fields: [outsideProcessingOrders.operationId],
      references: [operations.id],
    }),
    supplier: one(suppliers, {
      fields: [outsideProcessingOrders.supplierId],
      references: [suppliers.id],
    }),
    // outside_processing_orders 1-n outside_processing_receipts.
    receipts: many(outsideProcessingReceipts),
  }),
);

export type OutsideProcessingOrder = typeof outsideProcessingOrders.$inferSelect;
export type NewOutsideProcessingOrder = typeof outsideProcessingOrders.$inferInsert;
