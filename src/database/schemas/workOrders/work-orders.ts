import { relations } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { orders } from '../orders';
import { productionJobs } from '../production-jobs';
import { users } from '../users';
import { workOrderItems } from './work-order-items';

export enum WorkOrderStatus {
  PendingLsx = 'pending_lsx',
  LsxCreated = 'lsx_created',
}

export const workOrderStatusEnum = pgEnum('work_order_status', [
  WorkOrderStatus.PendingLsx,
  WorkOrderStatus.LsxCreated,
]);

export const workOrders = pgTable('work_orders', {
  // ID LSX.
  id: uuid('id').defaultRandom().primaryKey(),
  // PO đã được duyệt.
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'restrict' }),
  // Trạng thái LSX.
  status: workOrderStatusEnum('status').notNull().default(WorkOrderStatus.PendingLsx),
  // Ghi chú LSX.
  note: text('note'),
  // Người lập LSX.
  plannedBy: uuid('planned_by').references(() => users.id, { onDelete: 'set null' }),
  // Người tạo LSX.
  lsxCreatedBy: uuid('lsx_created_by').references(() => users.id, { onDelete: 'set null' }),
  // Thời gian tạo LSX.
  lsxCreatedAt: timestamp('lsx_created_at'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  order: one(orders, {
    fields: [workOrders.orderId],
    references: [orders.id],
  }),
  items: many(workOrderItems),
  // work_orders 1-n production_jobs.
  productionJobs: many(productionJobs),
  planner: one(users, {
    fields: [workOrders.plannedBy],
    references: [users.id],
  }),
  lsxCreator: one(users, {
    fields: [workOrders.lsxCreatedBy],
    references: [users.id],
  }),
}));

export type WorkOrder = typeof workOrders.$inferSelect;
export type NewWorkOrder = typeof workOrders.$inferInsert;
