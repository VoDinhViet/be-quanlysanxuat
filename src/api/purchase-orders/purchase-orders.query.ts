import { and, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  inventoryReceiptItems,
  inventoryReceipts,
  purchaseOrderItems,
  purchaseOrders,
  supplierReturns,
} from '../../database/schemas';

/** Tổng tiền PO = tiền hàng + VAT (`vat_percent`% trên tiền hàng, làm tròn 2 số lẻ) + chi phí khác.
 * `subtotal` là `orderAggregateSubquery().totalAmount`; truy vấn gọi phải có bảng `purchase_orders`. */
export function purchaseOrderGrandTotalSql(subtotal: SQL<number>) {
  return sql<number>`${subtotal} + round(${subtotal} * ${purchaseOrders.vatPercent} / 100, 2) + ${purchaseOrders.otherCost}`.mapWith(
    Number,
  );
}

/** Cùng công thức với `purchaseOrderGrandTotalSql`, cho màn chi tiết đã có sẵn các dòng. */
export function calculatePurchaseOrderAmounts(purchaseOrder: {
  items: {
    quantity: number;
    unitPrice: number | null;
    quotationQuantity?: number | null;
  }[];
  vatPercent: number;
  otherCost: number;
  advancePaymentAmount: number;
}) {
  const subtotal = purchaseOrder.items.reduce(
    (sum, item) =>
      sum + (item.quotationQuantity ?? item.quantity) * (item.unitPrice ?? 0),
    0,
  );
  const vatAmount = Math.round(subtotal * purchaseOrder.vatPercent) / 100;

  const totalAmount = subtotal + vatAmount + purchaseOrder.otherCost;

  return {
    subtotal,
    vatAmount,
    totalAmount,
    // Còn lại phải thanh toán sau khi trừ tạm ứng — kẹp 0 (đóng sớm PO làm tổng giảm dưới tạm ứng).
    balanceDue: Math.max(totalAmount - purchaseOrder.advancePaymentAmount, 0),
  };
}

/** Aggregate theo PO — Σ số dòng, Σ giá trị (SL tính tiền × đơn giá, SL tính tiền là SL báo giá nếu
 * dòng có ĐVBG, ngược lại là SL đặt), Σ SL đặt của mọi dòng. Dùng cho cả
 * lọc theo tiến độ (`orderedQuantity`) lẫn hiển thị (`itemCount`/`totalAmount`). */
export function orderAggregateSubquery(db: Database) {
  return db
    .select({
      purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      itemCount: sql<number>`count(*)`.mapWith(Number).as('item_count'),
      totalAmount:
        sql<number>`coalesce(sum(coalesce(${purchaseOrderItems.quotationQuantity}, ${purchaseOrderItems.quantity}) * ${purchaseOrderItems.unitPrice}), 0)`
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
      receivedQuantity:
        sql<number>`greatest(coalesce(${receipts.receivedQty}, 0) - coalesce(${returns.returnedQty}, 0), 0)`
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
        received:
          sql<number>`coalesce(sum(${inventoryReceiptItems.quantity}), 0)`
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
          eq(
            inventoryReceiptItems.receiptId,
            supplierReturns.inventoryReceiptId,
          ),
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
        return [row.purchaseOrderItemId, Math.max(row.received - returned, 0)];
      }),
  );
}

/** SL theo ĐVBG đã nhập kho theo từng dòng đơn mua (PH-135) — cơ sở tính tiền YCTT. Mỗi dòng phiếu
 * nhập `POSTED` đóng góp `quotationQuantity` đã trừ phần hàng trả NCC theo tỉ lệ
 * (SL đã trừ trả / SL nhập). Dòng phiếu thiếu `quotationQuantity` thì suy ra theo tỉ lệ SL báo giá
 * của dòng PO (SL nhập × SL báo giá / SL đặt). Dòng PO không có ĐVBG không xuất hiện trong kết quả. */
export async function getBilledQuotationQuantityByPurchaseOrderItemId(
  db: Database | DbTransaction,
  purchaseOrderItemIds: string[],
): Promise<Map<string, number>> {
  if (!purchaseOrderItemIds.length) {
    return new Map();
  }

  const [receiptLines, returnedLines] = await Promise.all([
    db
      .select({
        purchaseOrderItemId: inventoryReceiptItems.purchaseOrderItemId,
        receiptId: inventoryReceiptItems.receiptId,
        itemId: inventoryReceiptItems.itemId,
        quantity: inventoryReceiptItems.quantity,
        quotationQuantity: inventoryReceiptItems.quotationQuantity,
        orderedQuantity: purchaseOrderItems.quantity,
        orderedQuotationQuantity: purchaseOrderItems.quotationQuantity,
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
      .where(
        and(
          inArray(
            inventoryReceiptItems.purchaseOrderItemId,
            purchaseOrderItemIds,
          ),
          isNotNull(purchaseOrderItems.quotationUnit),
          eq(inventoryReceipts.status, InventoryDocumentStatus.POSTED),
        ),
      ),
    db
      .select({
        receiptId: supplierReturns.inventoryReceiptId,
        itemId: supplierReturns.itemId,
        returned: sql<number>`coalesce(sum(${supplierReturns.quantity}), 0)`
          .mapWith(Number)
          .as('returned'),
      })
      .from(supplierReturns)
      .innerJoin(
        inventoryReceiptItems,
        and(
          eq(
            inventoryReceiptItems.receiptId,
            supplierReturns.inventoryReceiptId,
          ),
          eq(inventoryReceiptItems.itemId, supplierReturns.itemId),
        ),
      )
      .where(
        and(
          inArray(
            inventoryReceiptItems.purchaseOrderItemId,
            purchaseOrderItemIds,
          ),
          eq(supplierReturns.status, InventoryDocumentStatus.POSTED),
        ),
      )
      .groupBy(supplierReturns.inventoryReceiptId, supplierReturns.itemId),
  ]);

  const returnedByReceiptItemKey = new Map(
    returnedLines.map((line) => [
      `${line.receiptId}:${line.itemId}`,
      line.returned,
    ]),
  );
  // Nhiều dòng cùng (phiếu, vật tư) chia chung phần trả theo tỉ lệ SL nhập của từng dòng.
  const receivedByReceiptItemKey = new Map<string, number>();
  for (const line of receiptLines) {
    const key = `${line.receiptId}:${line.itemId}`;
    receivedByReceiptItemKey.set(
      key,
      (receivedByReceiptItemKey.get(key) ?? 0) + line.quantity,
    );
  }

  const billedByPurchaseOrderItemId = new Map<string, number>();
  for (const line of receiptLines) {
    if (line.purchaseOrderItemId === null) continue;

    const key = `${line.receiptId}:${line.itemId}`;
    const groupReceived = receivedByReceiptItemKey.get(key) ?? line.quantity;
    const lineReturned =
      ((returnedByReceiptItemKey.get(key) ?? 0) * line.quantity) /
      groupReceived;
    const acceptedRatio =
      Math.max(line.quantity - lineReturned, 0) / line.quantity;

    const grossQuotationQuantity =
      line.quotationQuantity ??
      ((line.orderedQuotationQuantity ?? 0) * line.quantity) /
        line.orderedQuantity;

    billedByPurchaseOrderItemId.set(
      line.purchaseOrderItemId,
      (billedByPurchaseOrderItemId.get(line.purchaseOrderItemId) ?? 0) +
        grossQuotationQuantity * acceptedRatio,
    );
  }

  for (const [purchaseOrderItemId, billed] of billedByPurchaseOrderItemId) {
    billedByPurchaseOrderItemId.set(
      purchaseOrderItemId,
      Math.round(billed * 1000) / 1000,
    );
  }

  return billedByPurchaseOrderItemId;
}
