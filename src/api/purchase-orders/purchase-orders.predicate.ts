import { and, eq, isNull } from 'drizzle-orm';

import { purchaseOrders, PurchaseOrderStatus } from '../../database/schemas';

/** Đơn mua còn mở: đã đặt hàng và chưa đóng. */
export function isOpenPurchaseOrder() {
  return and(
    eq(purchaseOrders.status, PurchaseOrderStatus.ORDERED),
    isNull(purchaseOrders.closedAt),
  );
}
