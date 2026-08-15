/**
 * Tiến độ nhận hàng của một OS-OUT — tính lúc đọc (`OutsourcingOrdersService.getOutsourcingOrders`),
 * không lưu cột nào. Khác `outsourcing_orders.status` (chỉ 3 giá trị DRAFT/POSTED/CANCELLED trên
 * DB) — đây là 5 giá trị suy từ `status` + SL đã nhận (Σ OS-IN `POSTED`), cùng khuôn
 * `PurchaseOrderProgress` (`purchase-orders.constant.ts`).
 *
 * Chỗ cắm cho đợt sau: một giá trị `WAITING_QC` sẽ chèn trước `COMPLETED` khi có `iqc_inspections`
 * liên quan chưa `COMPLETED` — chưa làm đợt này (`docs/domains/inventory.md`).
 */
export enum OutsourcingOrderProgress {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PARTIAL = 'PARTIAL',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
