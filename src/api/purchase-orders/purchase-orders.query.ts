import { eq, sql } from 'drizzle-orm';

import type { Database } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  inventoryReceiptItems,
  inventoryReceipts,
  purchaseOrderItems,
} from '../../database/schemas';

/** Aggregate theo PO — Σ số dòng, Σ giá trị (SL đặt × đơn giá), Σ SL đặt của mọi dòng. Dùng cho cả
 * lọc theo tiến độ (`orderedQuantity`) lẫn hiển thị (`itemCount`/`totalAmount`). */
export function orderAggregateSubquery(db: Database) {
  return db
    .select({
      purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      itemCount: sql<number>`count(*)`.mapWith(Number).as('item_count'),
      totalAmount:
        sql<number>`coalesce(sum(${purchaseOrderItems.quantity} * ${purchaseOrderItems.unitPrice}), 0)`
          .mapWith(Number)
          .as('total_amount'),
      orderedQuantity: sql<number>`sum(${purchaseOrderItems.quantity})`
        .mapWith(Number)
        .as('ordered_quantity'),
    })
    .from(purchaseOrderItems)
    .groupBy(purchaseOrderItems.purchaseOrderId)
    .as('order_aggregate');
}

/** SL đã nhập kho theo PO — chỉ phiếu nhập `POSTED`, nối qua `purchase_order_items` (một dòng
 * phiếu nhập trace về đúng một dòng đơn mua). Copy `receivedQuantitySubquery`
 * (`purchase-ledger.query.ts`), chỉ đổi khoá group từ `purchaseRequestItemId` sang
 * `purchaseOrderId`. */
export function orderReceivedQuantitySubquery(db: Database) {
  return db
    .select({
      purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      receivedQuantity: sql<number>`sum(${inventoryReceiptItems.quantity})`
        .mapWith(Number)
        .as('received_quantity'),
    })
    .from(inventoryReceiptItems)
    .innerJoin(
      inventoryReceipts,
      eq(inventoryReceipts.id, inventoryReceiptItems.receiptId),
    )
    .innerJoin(
      purchaseOrderItems,
      eq(purchaseOrderItems.id, inventoryReceiptItems.purchaseOrderItemId),
    )
    .where(eq(inventoryReceipts.status, InventoryDocumentStatus.POSTED))
    .groupBy(purchaseOrderItems.purchaseOrderId)
    .as('order_received_quantity_aggregate');
}
