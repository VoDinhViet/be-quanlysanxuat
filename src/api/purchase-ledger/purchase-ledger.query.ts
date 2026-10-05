import { and, eq, ne, sql } from 'drizzle-orm';

import type { Database } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  inventoryReceiptItems,
  inventoryReceipts,
  PurchaseOrderStatus,
  purchaseOrderItems,
  purchaseOrders,
  PurchaseQuotationStatus,
  purchaseQuotationItemAllocations,
  purchaseQuotationItems,
  purchaseQuotations,
  supplierReturns,
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
 * dòng phiếu nhập trace về đúng một dòng đơn mua, dòng đơn mua trace về đúng một dòng đề xuất),
 * tự động khấu trừ số lượng hàng lỗi đã xuất trả NCC (`supplier_returns` đã `POSTED`). */
export function receivedQuantitySubquery(db: Database) {
  const receipts = db
    .select({
      purchaseRequestItemId: purchaseOrderItems.purchaseRequestItemId,
      receivedQty:
        sql<number>`coalesce(sum(${inventoryReceiptItems.quantity}), 0)`
          .mapWith(Number)
          .as('received_qty'),
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
    .as('pr_receipts');

  const returns = db
    .select({
      purchaseRequestItemId: purchaseOrderItems.purchaseRequestItemId,
      returnedQty: sql<number>`coalesce(sum(${supplierReturns.quantity}), 0)`
        .mapWith(Number)
        .as('returned_qty'),
    })
    .from(supplierReturns)
    .innerJoin(
      inventoryReceiptItems,
      and(
        eq(inventoryReceiptItems.receiptId, supplierReturns.inventoryReceiptId),
        eq(inventoryReceiptItems.itemId, supplierReturns.itemId),
      ),
    )
    .innerJoin(
      purchaseOrderItems,
      eq(purchaseOrderItems.id, inventoryReceiptItems.purchaseOrderItemId),
    )
    .where(eq(supplierReturns.status, InventoryDocumentStatus.POSTED))
    .groupBy(purchaseOrderItems.purchaseRequestItemId)
    .as('pr_returns');

  return db
    .select({
      purchaseRequestItemId: receipts.purchaseRequestItemId,
      receivedQuantity:
        sql<number>`greatest(coalesce(${receipts.receivedQty}, 0) - coalesce(${returns.returnedQty}, 0), 0)`
          .mapWith(Number)
          .as('received_quantity'),
    })
    .from(receipts)
    .leftJoin(
      returns,
      eq(returns.purchaseRequestItemId, receipts.purchaseRequestItemId),
    )
    .as('received_quantity_aggregate');
}

/** SL báo giá theo dòng đề xuất, tính trên báo giá chưa `CANCELLED` (kể cả chưa được chọn giá,
 * `selectedAt` không xét ở đây). Báo giá nháp / chờ duyệt: Σ `quantity` phân bổ
 * (`purchase_quotation_item_allocations`). Báo giá `APPROVED`: Σ `quantity` các dòng đơn mua sinh ra
 * từ nó (trừ PO đã huỷ), vì sau khi duyệt nguồn sự thật là đơn mua — đóng sớm PO (hạ/xoá dòng về
 * số đã nhận) tự trả phần thiếu về sổ cái để lập báo giá mới, báo giá gốc không bị sửa
 * (`docs/domains/purchasing.md`). */
export function quotedQuantitySubquery(db: Database) {
  const orderedByQuotation = db
    .select({
      quotationId: purchaseOrders.quotationId,
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
    .where(ne(purchaseOrders.status, PurchaseOrderStatus.CANCELLED))
    .groupBy(
      purchaseOrders.quotationId,
      purchaseOrderItems.purchaseRequestItemId,
    )
    .as('ordered_by_quotation');

  return db
    .select({
      purchaseRequestItemId:
        purchaseQuotationItemAllocations.purchaseRequestItemId,
      quotedQuantity:
        sql<number>`sum(case when ${purchaseQuotations.status} = ${PurchaseQuotationStatus.APPROVED} then coalesce(${orderedByQuotation.orderedQuantity}, 0) else ${purchaseQuotationItemAllocations.quantity} end)`
          .mapWith(Number)
          .as('quoted_quantity'),
    })
    .from(purchaseQuotationItemAllocations)
    .innerJoin(
      purchaseQuotationItems,
      eq(
        purchaseQuotationItems.id,
        purchaseQuotationItemAllocations.quotationItemId,
      ),
    )
    .innerJoin(
      purchaseQuotations,
      eq(purchaseQuotations.id, purchaseQuotationItems.quotationId),
    )
    .leftJoin(
      orderedByQuotation,
      and(
        eq(orderedByQuotation.quotationId, purchaseQuotations.id),
        eq(
          orderedByQuotation.purchaseRequestItemId,
          purchaseQuotationItemAllocations.purchaseRequestItemId,
        ),
      ),
    )
    .where(ne(purchaseQuotations.status, PurchaseQuotationStatus.CANCELLED))
    .groupBy(purchaseQuotationItemAllocations.purchaseRequestItemId)
    .as('quoted_quantity_aggregate');
}
