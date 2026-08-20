/** Tính lúc đọc (`OrdersService.getOrder`), không lưu cột — SUM(order_payments.amount) so với
 * `orders.total`. Cùng khuôn `PurchaseOrderProgress`. */
export enum OrderPaymentStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
}
