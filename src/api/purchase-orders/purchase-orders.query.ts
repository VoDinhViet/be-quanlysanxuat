import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  inventoryReceiptItems,
  inventoryReceipts,
  purchaseOrderItems,
  supplierReturns,
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
 * phiếu nhập trace về đúng một dòng đơn mua), tự động khấu trừ số lượng hàng lỗi đã xuất trả NCC
 * (`supplier_returns` đã `POSTED`). */
export function orderReceivedQuantitySubquery(db: Database | DbTransaction) {
  const receipts = db
    .select({
      purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      receivedQty: sql<number>`coalesce(sum(${inventoryReceiptItems.quantity}), 0)`
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
    .groupBy(purchaseOrderItems.purchaseOrderId)
    .as('po_receipts');

  const returns = db
    .select({
      purchaseOrderId: supplierReturns.purchaseOrderId,
      returnedQty: sql<number>`coalesce(sum(${supplierReturns.quantity}), 0)`
        .mapWith(Number)
        .as('returned_qty'),
    })
    .from(supplierReturns)
    .where(
      and(
        isNotNull(supplierReturns.purchaseOrderId),
        eq(supplierReturns.status, InventoryDocumentStatus.POSTED),
      ),
    )
    .groupBy(supplierReturns.purchaseOrderId)
    .as('po_returns');

  return db
    .select({
      purchaseOrderId: receipts.purchaseOrderId,
      receivedQuantity: sql<number>`greatest(coalesce(${receipts.receivedQty}, 0) - coalesce(${returns.returnedQty}, 0), 0)`
        .mapWith(Number)
        .as('received_quantity'),
    })
    .from(receipts)
    .leftJoin(returns, eq(returns.purchaseOrderId, receipts.purchaseOrderId))
    .as('order_received_quantity_aggregate');
}

/** SL đã nhận theo từng dòng đơn mua, gộp theo `purchaseOrderItemId` — dùng chung bởi
 * `InventoryReceiptsService` (chặn SL vượt, tính trên các trạng thái đã `confirm`) và
 * `PurchaseOrdersService` (hiển thị SL đã nhập trên dòng PO, chỉ tính `POSTED`).
 * Tự động khấu trừ số lượng hàng lỗi đã xuất trả NCC (`supplier_returns` đã `POSTED`). */
export async function getReceivedQuantityByPurchaseOrderItemId(
  db: Database | DbTransaction,
  params: {
    purchaseOrderItemIds: string[];
    statuses: InventoryDocumentStatus[];
  },
): Promise<Map<string, number>> {
  if (!params.purchaseOrderItemIds.length) {
    return new Map();
  }

  const [receivedRows, returnedRows] = await Promise.all([
    db
      .select({
        purchaseOrderItemId: inventoryReceiptItems.purchaseOrderItemId,
        received: sql<number>`coalesce(sum(${inventoryReceiptItems.quantity}), 0)`
          .mapWith(Number)
          .as('received'),
      })
      .from(inventoryReceiptItems)
      .innerJoin(
        inventoryReceipts,
        eq(inventoryReceipts.id, inventoryReceiptItems.receiptId),
      )
      .where(
        and(
          inArray(
            inventoryReceiptItems.purchaseOrderItemId,
            params.purchaseOrderItemIds,
          ),
          inArray(inventoryReceipts.status, params.statuses),
        ),
      )
      .groupBy(inventoryReceiptItems.purchaseOrderItemId),

    db
      .select({
        purchaseOrderItemId: inventoryReceiptItems.purchaseOrderItemId,
        returned: sql<number>`coalesce(sum(${supplierReturns.quantity}), 0)`
          .mapWith(Number)
          .as('returned'),
      })
      .from(supplierReturns)
      .innerJoin(
        inventoryReceiptItems,
        and(
          eq(inventoryReceiptItems.receiptId, supplierReturns.inventoryReceiptId),
          eq(inventoryReceiptItems.itemId, supplierReturns.itemId),
        ),
      )
      .where(
        and(
          inArray(
            inventoryReceiptItems.purchaseOrderItemId,
            params.purchaseOrderItemIds,
          ),
          eq(supplierReturns.status, InventoryDocumentStatus.POSTED),
        ),
      )
      .groupBy(inventoryReceiptItems.purchaseOrderItemId),
  ]);

  const returnedByPoItemId = new Map(
    returnedRows
      .filter(
        (row): row is { purchaseOrderItemId: string; returned: number } =>
          row.purchaseOrderItemId !== null,
      )
      .map((row) => [row.purchaseOrderItemId, row.returned]),
  );

  return new Map(
    receivedRows
      .filter(
        (row): row is { purchaseOrderItemId: string; received: number } =>
          row.purchaseOrderItemId !== null,
      )
      .map((row) => {
        const returned = returnedByPoItemId.get(row.purchaseOrderItemId) ?? 0;
        return [
          row.purchaseOrderItemId,
          Math.max(row.received - returned, 0),
        ];
      }),
  );
}

