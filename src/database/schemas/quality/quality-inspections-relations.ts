import { relations } from 'drizzle-orm';

import { departments } from '../departments';
import { inventoryReceipts } from '../inventory/inventory-receipts';
import { outsourcingReceiptItems } from '../inventory/outsourcing-receipt-items';
import { outsourcingReceipts } from '../inventory/outsourcing-receipts';
import { supplierReturns } from '../inventory/supplier-returns';
import { items } from '../items/items';
import { productionJobOperations } from '../production/production-job-operations';
import { productionJobs } from '../production/production-jobs';
import { purchaseOrders } from '../purchasing/purchase-orders';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';
import { qcAttachments } from './qc-attachments';
import { qualityInspections } from './quality-inspections';

/**
 * Tách khỏi `quality-inspections.ts` chỉ vì `supplier_returns` (composite FK `(iqc_id, qc_kind)`)
 * cần `qualityInspections` NGAY LÚC module-load, không phải qua thunk lazy như FK thường —
 * import `supplierReturns` thẳng trong `quality-inspections.ts` tạo vòng lặp module thật. Xem
 * comment ở `quality-inspections.ts` (chỗ từng đặt khối này).
 */
export const qualityInspectionsRelations = relations(
  qualityInspections,
  ({ one, many }) => ({
    inventoryReceipt: one(inventoryReceipts, {
      fields: [qualityInspections.inventoryReceiptId],
      references: [inventoryReceipts.id],
    }),
    outsourcingReceipt: one(outsourcingReceipts, {
      fields: [qualityInspections.outsourcingReceiptId],
      references: [outsourcingReceipts.id],
    }),
    outsourcingReceiptItem: one(outsourcingReceiptItems, {
      fields: [qualityInspections.outsourcingReceiptItemId],
      references: [outsourcingReceiptItems.id],
    }),
    purchaseOrder: one(purchaseOrders, {
      fields: [qualityInspections.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    supplier: one(suppliers, {
      fields: [qualityInspections.supplierId],
      references: [suppliers.id],
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
    confirmerBy: one(users, {
      fields: [qualityInspections.confirmedBy],
      references: [users.id],
    }),
    resolverBy: one(users, {
      fields: [qualityInspections.resolvedBy],
      references: [users.id],
    }),
    attachments: many(qcAttachments),
    // Thực tế tối đa 1 dòng (1 IQC chỉ tự sinh 1 phiếu trả NCC, đúng lúc `confirm` chuyển
    // `WAITING_RETURN`) nhưng khai `many` vì `supplier_returns.iqc_id` không có UNIQUE constraint
    // — xem `SupplierReturnsService.createFromIqcDisposition`.
    supplierReturns: many(supplierReturns),
  }),
);
