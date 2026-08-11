/**
 * Tiến độ nhận hàng của một PO — tính lúc đọc (`PurchaseOrdersService.getPurchaseOrders`), không
 * lưu cột nào. Khác `purchase_orders.status` (chỉ 3 giá trị DRAFT/ORDERED/CANCELLED trên DB) —
 * đây là 5 giá trị suy từ `status` + `receivedQuantity`/`orderedQuantity` (phiếu nhập kho POSTED),
 * cùng khuôn `PurchaseLedgerStatus` (`purchase-ledger.constant.ts`).
 */
export enum PurchaseOrderProgress {
  DRAFT = 'DRAFT',
  ORDERED = 'ORDERED',
  RECEIVING = 'RECEIVING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
