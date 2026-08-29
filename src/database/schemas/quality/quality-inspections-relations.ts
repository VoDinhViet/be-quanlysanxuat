import { relations } from 'drizzle-orm';

import { departments } from '../departments';
import { items } from '../items/items';
import { productionJobOperations } from '../production/production-job-operations';
import { productionJobs } from '../production/production-jobs';
import { purchaseOrders } from '../purchasing/purchase-orders';
import { suppliers } from '../suppliers/suppliers';
import { clients } from '../clients/clients';
import { users } from '../identity-access/users';
import { qualityInspectionResults } from './quality-inspection-results';
import { qualityInspections } from './quality-inspections';

/**
 * File riêng — lý do y hệt `qc-requests-relations.ts`: quan hệ `supplierReturns` (thêm khi
 * `supplier_returns` có cột `qualityInspectionId` — bước sau của migration) cần import
 * `supplierReturns`, mà bảng đó có composite FK dereference `qualityInspections` NGAY LÚC
 * module-load, tạo vòng lặp thật nếu import chéo ngay trong `quality-inspections.ts`.
 *
 * Không có quan hệ `inventoryReceipt`/`outsourcingReceipt`/`outsourcingReceiptItem` — origin giờ là
 * polymorphic (`originType`/`originId`), Drizzle không hỗ trợ `relations()` cho FK polymorphic;
 * service tự join theo `originType` khi cần đọc kèm chứng từ nguồn.
 */
export const qualityInspectionsRelations = relations(
  qualityInspections,
  ({ one, many }) => ({
    purchaseOrder: one(purchaseOrders, {
      fields: [qualityInspections.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    supplier: one(suppliers, {
      fields: [qualityInspections.supplierId],
      references: [suppliers.id],
    }),
    client: one(clients, {
      fields: [qualityInspections.clientId],
      references: [clients.id],
    }),
    productionJob: one(productionJobs, {
      fields: [qualityInspections.productionJobId],
      references: [productionJobs.id],
    }),
    productionJobOperation: one(productionJobOperations, {
      fields: [qualityInspections.productionJobOperationId],
      references: [productionJobOperations.id],
    }),
    item: one(items, {
      fields: [qualityInspections.itemId],
      references: [items.id],
    }),
    qcDepartment: one(departments, {
      fields: [qualityInspections.qcDepartmentId],
      references: [departments.id],
    }),
    creatorBy: one(users, {
      fields: [qualityInspections.createdBy],
      references: [users.id],
    }),
    inspectorBy: one(users, {
      fields: [qualityInspections.inspectedBy],
      references: [users.id],
    }),
    approverBy: one(users, {
      fields: [qualityInspections.approvedBy],
      references: [users.id],
    }),
    results: many(qualityInspectionResults),
  }),
);
