import { relations } from 'drizzle-orm';

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
 * Quan hệ của `quality_inspections` ở file riêng để tránh vòng import: `supplier_returns` có
 * composite FK dereference `qualityInspections` ngay lúc load module.
 *
 * Không có quan hệ tới chứng từ nguồn (`inventoryReceipt`/`outsourcingReceiptItem`) vì origin là
 * polymorphic (`originType`/`originId`), Drizzle không hỗ trợ `relations()` cho FK polymorphic;
 * service tự join theo `originType` khi cần.
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
