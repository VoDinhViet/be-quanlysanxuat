import { eq, ne, sql } from 'drizzle-orm';

import type { Database } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  inventoryReceiptItems,
  inventoryReceipts,
  PurchaseOrderStatus,
  purchaseOrderItems,
  purchaseOrders,
  PurchaseQuotationStatus,
  purchaseQuotationItems,
  purchaseQuotations,
} from '../../database/schemas';

/** SL đặt mua theo dòng đề xuất — Σ `quantity` của đơn mua đã `ORDERED`. Không đếm `DRAFT` (đơn
 * đang soạn, chưa đặt) hay `CANCELLED`. */
export function orderedQuantitySubquery(db: Database) {
  return db
    .select({
      purchaseRequestItemId: purchaseOrderItems.purchaseRequestItemId,
      orderedQuantity: sql<number>`sum(${purchaseOrderItems.quantity})`
        .mapWith(Number)
        .as('ordered_quantity'),
    })
    .from(purchaseOrderItems)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId),
    )
    .where(eq(purchaseOrders.status, PurchaseOrderStatus.ORDERED))
    .groupBy(purchaseOrderItems.purchaseRequestItemId)
    .as('ordered_quantity_aggregate');
}

/** SL đã nhập kho theo dòng đề xuất — chỉ phiếu nhập `POSTED`, nối qua `purchase_order_items` (một
 * dòng phiếu nhập trace về đúng một dòng đơn mua, dòng đơn mua trace về đúng một dòng đề xuất). */
export function receivedQuantitySubquery(db: Database) {
  return db
    .select({
      purchaseRequestItemId: purchaseOrderItems.purchaseRequestItemId,
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
    .groupBy(purchaseOrderItems.purchaseRequestItemId)
    .as('received_quantity_aggregate');
}

/** SL báo giá theo dòng đề xuất — Σ `quantity` của **mọi** dòng báo giá chưa `CANCELLED`, kể cả
 * chưa được chọn giá (`selectedAt` không xét ở đây). */
export function quotedQuantitySubquery(db: Database) {
  return db
    .select({
      purchaseRequestItemId: purchaseQuotationItems.purchaseRequestItemId,
      quotedQuantity: sql<number>`sum(${purchaseQuotationItems.quantity})`
        .mapWith(Number)
        .as('quoted_quantity'),
    })
    .from(purchaseQuotationItems)
    .innerJoin(
      purchaseQuotations,
      eq(purchaseQuotations.id, purchaseQuotationItems.quotationId),
    )
    .where(ne(purchaseQuotations.status, PurchaseQuotationStatus.CANCELLED))
    .groupBy(purchaseQuotationItems.purchaseRequestItemId)
    .as('quoted_quantity_aggregate');
}
