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

/** SL đặt mua theo dòng đề xuất — chỉ đơn mua chưa `CANCELLED`. `totalOrderItems` (kể cả đơn đã
 * hủy) phân biệt "chưa từng đặt mua" với "đã đặt mua nhưng mọi đơn đều bị hủy" — cả hai cho
 * `orderedQuantity = 0` nhưng ứng với hai trạng thái sổ cái khác nhau (`docs/domains/purchasing.md`). */
export function purchaseOrderAggregateSubquery(db: Database) {
  return db
    .select({
      purchaseRequestItemId: purchaseOrderItems.purchaseRequestItemId,
      orderedQuantity:
        sql<number>`sum(case when ${purchaseOrders.status} <> ${PurchaseOrderStatus.CANCELLED} then ${purchaseOrderItems.quantity} else 0 end)`
          .mapWith(Number)
          .as('ordered_quantity'),
      totalOrderItems: sql<number>`count(*)`
        .mapWith(Number)
        .as('total_order_items'),
    })
    .from(purchaseOrderItems)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId),
    )
    .groupBy(purchaseOrderItems.purchaseRequestItemId)
    .as('purchase_order_aggregate');
}

/** SL đã nhập kho theo dòng đề xuất — chỉ phiếu nhập `POSTED`, nối qua `purchase_order_items` (một
 * dòng phiếu nhập trace về đúng một dòng đơn mua, dòng đơn mua trace về đúng một dòng đề xuất). */
export function receivedQuantityAggregateSubquery(db: Database) {
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

/** Trạng thái báo giá theo dòng đề xuất — chỉ báo giá chưa `CANCELLED`. `hasQuoted` = đã có NCC trả
 * giá (`unitPrice` không null); `selectedAt` = mốc chốt giá gần nhất còn sống. */
export function quotationAggregateSubquery(db: Database) {
  return db
    .select({
      purchaseRequestItemId: purchaseQuotationItems.purchaseRequestItemId,
      hasQuoted:
        sql<boolean>`bool_or(${purchaseQuotationItems.unitPrice} is not null)`
          .mapWith(Boolean)
          .as('has_quoted'),
      selectedAt:
        sql<Date | null>`max(${purchaseQuotationItems.selectedAt})`.as(
          'selected_at',
        ),
    })
    .from(purchaseQuotationItems)
    .innerJoin(
      purchaseQuotations,
      eq(purchaseQuotations.id, purchaseQuotationItems.quotationId),
    )
    .where(ne(purchaseQuotations.status, PurchaseQuotationStatus.CANCELLED))
    .groupBy(purchaseQuotationItems.purchaseRequestItemId)
    .as('quotation_aggregate');
}
