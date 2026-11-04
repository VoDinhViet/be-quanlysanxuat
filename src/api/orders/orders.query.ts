import { and, eq, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  inventoryTransactions,
  OutboundOrderInvoiceStatus,
  outboundOrderItems,
  outboundOrders,
  OutboundOrderStatus,
} from '../../database/schemas';

/** SL đã xuất/giao thật theo từng dòng đơn — cùng logic `InventoryService.deliveredSubquery`
 * (`src/api/inventory/inventory.service.ts`), copy có chủ ý vì khác domain tiêu thụ (cùng quy ước
 * `purchase-orders.query.ts` copy `receivedQuantitySubquery`). Không lọc `type`/trạng thái phiếu —
 * huỷ phiếu tự triệt tiêu qua bút toán đảo dấu cùng `orderItemId`. Nhận `tx` khi cần đọc trong cùng
 * transaction vừa ghi bút toán (`InventoryIssuesService.postInventoryIssue`), `db` cho mọi nơi
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

/** Hoá đơn của từng dòng đơn, lấy từ phiếu giao đã giao (`DELIVERED`) và đã xuất hoá đơn (`ISSUED`).
 * Một dòng đơn giao nhiều lần có thể có nhiều hoá đơn: số hoá đơn nối bằng ", ", ngày lấy ngày
 * mới nhất. */
export function invoicesByOrderItemIdSubquery(db: Database | DbTransaction) {
  return db
    .select({
      orderItemId: outboundOrderItems.orderItemId,
      invoiceNumbers:
        sql<string>`string_agg(distinct ${outboundOrders.invoiceNo}, ', ' order by ${outboundOrders.invoiceNo})`.as(
          'invoice_numbers',
        ),
      // `max()` trên raw `sql` trả chuỗi thô; `mapWith` mượn decoder của cột `invoiceDate` để ra `Date`.
      latestInvoiceDate: sql<Date | null>`max(${outboundOrders.invoiceDate})`
        .mapWith(outboundOrders.invoiceDate)
        .as('latest_invoice_date'),
    })
    .from(outboundOrderItems)
    .innerJoin(
      outboundOrders,
      eq(outboundOrders.id, outboundOrderItems.outboundOrderId),
    )
    .where(
      and(
        eq(outboundOrders.status, OutboundOrderStatus.DELIVERED),
        eq(outboundOrders.invoiceStatus, OutboundOrderInvoiceStatus.ISSUED),
      ),
    )
    .groupBy(outboundOrderItems.orderItemId)
    .as('invoices_by_order_item');
}
