/**
 * Trạng thái một dòng sổ cái mua hàng — tính lúc đọc (`PurchaseLedgerService.getPurchaseLedgers`),
 * không lưu cột nào. `COMPLETED` cần `receivedQuantity` (nối qua `purchaseOrderItemId`, phiếu nhập
 * `POSTED`) nên chưa thể xuất hiện thật tới khi `inventory-receipts` nối cột này
 * (`docs/domains/purchasing.md`).
 */
export enum PurchaseLedgerStatus {
  WAITING_TO_PURCHASE = 'WAITING_TO_PURCHASE',
  QUOTING = 'QUOTING',
  ORDERED = 'ORDERED',
  COMPLETED = 'COMPLETED',
}
