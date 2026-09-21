import { sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import { inventoryTransactions, orderPayments } from '../../database/schemas';

/** SL đã xuất/giao thật theo từng dòng đơn — cùng logic `InventoryService.deliveredSubquery`
 * (`src/api/inventory/inventory.service.ts`), copy có chủ ý vì khác domain tiêu thụ (cùng quy ước
 * `purchase-orders.query.ts` copy `receivedQuantitySubquery`). Không lọc `type`/trạng thái phiếu —
 * huỷ phiếu tự triệt tiêu qua bút toán đảo dấu cùng `orderItemId`. Nhận `tx` khi cần đọc trong cùng
 * transaction vừa ghi bút toán (`OutboundOrdersService.deliverOutboundOrder`), `db` cho mọi nơi
 * khác. */
export function issuedQuantityByOrderItemIdSubquery(
  db: Database | DbTransaction,
) {
  return db
    .select({
      orderItemId: inventoryTransactions.orderItemId,
      issuedQty: sql<number>`sum(-${inventoryTransactions.quantity})`
        .mapWith(Number)
        .as('issued_qty'),
    })
    .from(inventoryTransactions)
    .where(sql`${inventoryTransactions.orderItemId} IS NOT NULL`)
    .groupBy(inventoryTransactions.orderItemId)
    .as('issued_qty_by_order_item');
}

/** Tổng đã trả theo từng đơn — cùng khuôn `receivedQuantityByOrderItemIdSubquery`
 * (`src/api/outsourcing-receipts/outsourcing-receipts.query.ts`): để `LEFT JOIN` thẳng vào
 * `OrdersService.getOrder`. `order_payments` là sổ cái append-only nên không cần lọc trạng thái
 * gì thêm. */
export function paidAmountByOrderIdSubquery(db: Database) {
  return db
    .select({
      orderId: orderPayments.orderId,
      paidAmount: sql<number>`sum(${orderPayments.amount})`
        .mapWith(Number)
        .as('paid_amount'),
    })
    .from(orderPayments)
    .groupBy(orderPayments.orderId)
    .as('paid_amount_by_order');
}
