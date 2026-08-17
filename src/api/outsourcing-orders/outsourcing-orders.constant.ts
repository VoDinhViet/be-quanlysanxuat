/**
 * Tiến độ nhận hàng của một OS-OUT — suy lúc đọc, không lưu cột. Khác `outsourcing_orders.status`;
 * luật suy ở `OutsourcingOrdersService.resolveOrderProgress`, cùng khuôn `PurchaseOrderProgress`.
 * `DRAFT` chỉ còn cho dữ liệu cũ trước khi bỏ nháp — không route nào tạo `DRAFT` nữa.
 */
export enum OutsourcingOrderProgress {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PARTIAL = 'PARTIAL',
  WAITING_QC = 'WAITING_QC',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
