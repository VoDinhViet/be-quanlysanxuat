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
import { qcInspections } from './qc-inspections';
import { qcRequests } from './qc-requests';

/**
 * Tách khỏi `qc-requests.ts` chỉ vì `supplier_returns` (composite FK `(iqc_id, qc_kind)`) cần
 * `qcRequests` NGAY LÚC module-load, không phải qua thunk lazy như FK thường — import
 * `supplierReturns` thẳng trong `qc-requests.ts` tạo vòng lặp module thật. Xem comment ở
 * `qc-requests.ts` (chỗ từng đặt khối này).
 */
export const qcRequestsRelations = relations(qcRequests, ({ one, many }) => ({
  inventoryReceipt: one(inventoryReceipts, {
    fields: [qcRequests.inventoryReceiptId],
    references: [inventoryReceipts.id],
  }),
  outsourcingReceipt: one(outsourcingReceipts, {
    fields: [qcRequests.outsourcingReceiptId],
    references: [outsourcingReceipts.id],
  }),
  outsourcingReceiptItem: one(outsourcingReceiptItems, {
    fields: [qcRequests.outsourcingReceiptItemId],
    references: [outsourcingReceiptItems.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [qcRequests.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  supplier: one(suppliers, {
    fields: [qcRequests.supplierId],
    references: [suppliers.id],
  }),
  productionJob: one(productionJobs, {
    fields: [qcRequests.productionJobId],
    references: [productionJobs.id],
  }),
  productionJobOperation: one(productionJobOperations, {
    fields: [qcRequests.productionJobOperationId],
    references: [productionJobOperations.id],
  }),
  item: one(items, {
    fields: [qcRequests.itemId],
    references: [items.id],
  }),
  qcDepartment: one(departments, {
    fields: [qcRequests.qcDepartmentId],
    references: [departments.id],
  }),
  creatorBy: one(users, {
    fields: [qcRequests.createdBy],
    references: [users.id],
  }),
  confirmerBy: one(users, {
    fields: [qcRequests.confirmedBy],
    references: [users.id],
  }),
  resolverBy: one(users, {
    fields: [qcRequests.resolvedBy],
    references: [users.id],
  }),
  // Sắp theo `attemptNo` ở nơi gọi (`db.query.qcRequests.findFirst({ with: { inspections: { orderBy
  // } } })`) — `relations()` không nhận `orderBy` mặc định cho quan hệ.
  inspections: many(qcInspections),
  // Thực tế tối đa 1 dòng (1 IQC chỉ tự sinh 1 phiếu trả NCC, đúng lúc `confirm` chuyển
  // `WAITING_RETURN`) nhưng khai `many` vì `supplier_returns.iqc_id` không có UNIQUE constraint —
  // xem `SupplierReturnsService.createFromIqcDisposition`.
  supplierReturns: many(supplierReturns),
}));
