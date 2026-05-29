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

import { orders } from './orders';
import { products } from './products';
import { productionJobs } from './production-jobs';
import { users } from './users';

export enum PurchaseRequisitionStatus {
  Draft = 'draft',
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

export const purchaseRequisitionStatusEnum = pgEnum('purchase_requisition_status', [
  PurchaseRequisitionStatus.Draft,
  PurchaseRequisitionStatus.Pending,
  PurchaseRequisitionStatus.Approved,
  PurchaseRequisitionStatus.Rejected,
  PurchaseRequisitionStatus.Cancelled,
]);

/**
 * Phiếu đề xuất mua hàng.
 */
export const purchaseRequisitions = pgTable('purchase_requisitions', {
  // ID phiếu ĐX.
  id: uuid('id').defaultRandom().primaryKey(),
  // Mã phiếu ĐX.
  code: varchar('code', { length: 50 }).notNull(),
  // Ngày tạo phiếu.
  requestDate: date('request_date').notNull(),
  // Ngày cần hàng.
  requiredDate: date('required_date').notNull(),
  // Người đề xuất.
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  // Phòng ban đề xuất.
  departmentId: uuid('department_id'),
  // PO liên quan.
  salesOrderId: uuid('sales_order_id').references(() => orders.id, { onDelete: 'set null' }),
  // Job sản xuất liên quan.
  productionJobId: uuid('production_job_id').references(() => productionJobs.id, {
    onDelete: 'set null',
  }),
  // Lý do đề xuất.
  reason: text('reason'),
  // Trạng thái phiếu.
  status: purchaseRequisitionStatusEnum('status')
    .notNull()
    .default(PurchaseRequisitionStatus.Draft),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const purchaseRequisitionItems = pgTable('purchase_requisition_items', {
  // ID dòng ĐX.
  id: uuid('id').defaultRandom().primaryKey(),
  // Phiếu ĐX mua hàng.
  purchaseRequisitionId: uuid('purchase_requisition_id')
    .notNull()
    .references(() => purchaseRequisitions.id, { onDelete: 'cascade' }),
  // Vật tư cần mua.
  materialId: uuid('material_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // Số lượng BOM.
  bomQty: numeric('bom_qty', { precision: 18, scale: 3 }).notNull().default('0'),
  // Tồn thực tế.
  actualStockQty: numeric('actual_stock_qty', { precision: 18, scale: 3 }).notNull().default('0'),
  // Tồn khả dụng.
  availableStockQty: numeric('available_stock_qty', { precision: 18, scale: 3 })
    .notNull()
    .default('0'),
  // Số lượng đề xuất.
  requestedQty: numeric('requested_qty', { precision: 18, scale: 3 }).notNull(),
  // Ghi chú.
  note: text('note'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const purchaseRequisitionsRelations = relations(purchaseRequisitions, ({ one, many }) => ({
  requestedUser: one(users, {
    fields: [purchaseRequisitions.requestedBy],
    references: [users.id],
  }),
  salesOrder: one(orders, {
    fields: [purchaseRequisitions.salesOrderId],
    references: [orders.id],
  }),
  productionJob: one(productionJobs, {
    fields: [purchaseRequisitions.productionJobId],
    references: [productionJobs.id],
  }),
  items: many(purchaseRequisitionItems),
}));

export const purchaseRequisitionItemsRelations = relations(purchaseRequisitionItems, ({ one }) => ({
  purchaseRequisition: one(purchaseRequisitions, {
    fields: [purchaseRequisitionItems.purchaseRequisitionId],
    references: [purchaseRequisitions.id],
  }),
  material: one(products, {
    fields: [purchaseRequisitionItems.materialId],
    references: [products.id],
  }),
}));

export type PurchaseRequisition = typeof purchaseRequisitions.$inferSelect;
export type NewPurchaseRequisition = typeof purchaseRequisitions.$inferInsert;
export type PurchaseRequisitionItem = typeof purchaseRequisitionItems.$inferSelect;
export type NewPurchaseRequisitionItem = typeof purchaseRequisitionItems.$inferInsert;
