/**
 * Tiến độ nhận hàng của một PO — tính lúc đọc (`PurchaseOrdersService.getPurchaseOrders`), không
 * lưu cột nào. Khác `purchase_orders.status` (chỉ 3 giá trị PENDING_CONFIRMATION/ORDERED/CANCELLED trên DB) —
 * đây là 5 giá trị suy từ `status` + `receivedQuantity`/`orderedQuantity` (phiếu nhập kho POSTED),
 * cùng khuôn `PurchaseLedgerStatus` (`purchase-ledger.constant.ts`).
 */
export enum PurchaseOrderProgress {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  ORDERED = 'ORDERED',
  RECEIVING = 'RECEIVING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
