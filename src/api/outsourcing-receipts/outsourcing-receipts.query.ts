import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  outsourcingReceiptItems,
  outsourcingReceipts,
  OutsourcingReceiptStatus,
  supplierReturns,
} from '../../database/schemas';

/** Σ SL đã nhận theo từng dòng OS-OUT (`outsourcingOrderItemId`) — dùng cho popup "chọn hàng cần
 * nhận", validate `E172` (create OS-IN), và tính tiến độ dòng OS-OUT. Chỉ tính phiếu `POSTED`, tự
 * động khấu trừ SL hàng lỗi đã xuất trả NCC (`supplier_returns` đã `POSTED`, nối qua
 * `(outsourcingReceiptId, itemId)` — `supplier_returns` không có FK tới từng dòng OS-IN), cùng
 * pattern `getReceivedQuantityByPurchaseOrderItemId` (`purchase-orders.query.ts`). */
export async function getReceivedQuantityByOrderItemIds(
  db: Database | DbTransaction,
  orderItemIds: string[],
): Promise<Map<string, number>> {
  if (!orderItemIds.length) {
    return new Map();
  }

  const [receivedRows, returnedRows] = await Promise.all([
    db
      .select({
        outsourcingOrderItemId: outsourcingReceiptItems.outsourcingOrderItemId,
        received:
          sql<number>`coalesce(sum(${outsourcingReceiptItems.quantity}), 0)`.mapWith(
            Number,
          ),
      })
      .from(outsourcingReceiptItems)
      .innerJoin(
        outsourcingReceipts,
        eq(
          outsourcingReceipts.id,
          outsourcingReceiptItems.outsourcingReceiptId,
        ),
      )
      .where(
        and(
          inArray(outsourcingReceiptItems.outsourcingOrderItemId, orderItemIds),
          eq(outsourcingReceipts.status, OutsourcingReceiptStatus.POSTED),
        ),
      )
      .groupBy(outsourcingReceiptItems.outsourcingOrderItemId),

    db
      .select({
        outsourcingOrderItemId: outsourcingReceiptItems.outsourcingOrderItemId,
        returned:
          sql<number>`coalesce(sum(${supplierReturns.quantity}), 0)`.mapWith(
            Number,
          ),
      })
      .from(supplierReturns)
      .innerJoin(
        outsourcingReceiptItems,
        and(
          eq(
            outsourcingReceiptItems.outsourcingReceiptId,
            supplierReturns.outsourcingReceiptId,
          ),
          eq(outsourcingReceiptItems.itemId, supplierReturns.itemId),
        ),
      )
      .where(
        and(
          inArray(outsourcingReceiptItems.outsourcingOrderItemId, orderItemIds),
          eq(supplierReturns.status, InventoryDocumentStatus.POSTED),
        ),
      )
      .groupBy(outsourcingReceiptItems.outsourcingOrderItemId),
  ]);

  const returnedByOrderItemId = new Map(
    returnedRows.map((row) => [row.outsourcingOrderItemId, row.returned]),
  );

  return new Map(
    receivedRows.map((row) => [
      row.outsourcingOrderItemId,
      Math.max(
        row.received -
          (returnedByOrderItemId.get(row.outsourcingOrderItemId) ?? 0),
        0,
      ),
    ]),
  );
}

/** Bản subquery-table của `getReceivedQuantityByOrderItemIds` — cùng logic SUM trừ hao hụt trả NCC,
 * cố định `POSTED` — để LEFT JOIN thẳng vào SELECT hiển thị
 * (`OutsourcingOrdersService.getOrderItems`, `OutsourcingReceiptsService.getPendingOrderItems`)
 * thay vì round-trip `Map` riêng. Nơi validate `E172` (create OS-IN) vẫn dùng bản `Map` vì không có
 * SELECT nào để join vào. */
export function receivedQuantityByOrderItemIdSubquery(db: Database) {
  const receipts = db
    .select({
      outsourcingOrderItemId: outsourcingReceiptItems.outsourcingOrderItemId,
      receivedQty:
        sql<number>`coalesce(sum(${outsourcingReceiptItems.quantity}), 0)`
          .mapWith(Number)
          .as('received_qty'),
    })
    .from(outsourcingReceiptItems)
    .innerJoin(
      outsourcingReceipts,
      eq(outsourcingReceipts.id, outsourcingReceiptItems.outsourcingReceiptId),
    )
    .where(eq(outsourcingReceipts.status, OutsourcingReceiptStatus.POSTED))
    .groupBy(outsourcingReceiptItems.outsourcingOrderItemId)
    .as('order_item_receipts');

  const returns = db
    .select({
      outsourcingOrderItemId: outsourcingReceiptItems.outsourcingOrderItemId,
      returnedQty: sql<number>`coalesce(sum(${supplierReturns.quantity}), 0)`
        .mapWith(Number)
        .as('returned_qty'),
    })
    .from(supplierReturns)
    .innerJoin(
      outsourcingReceiptItems,
      and(
        eq(
          outsourcingReceiptItems.outsourcingReceiptId,
          supplierReturns.outsourcingReceiptId,
        ),
        eq(outsourcingReceiptItems.itemId, supplierReturns.itemId),
      ),
    )
    .where(eq(supplierReturns.status, InventoryDocumentStatus.POSTED))
    .groupBy(outsourcingReceiptItems.outsourcingOrderItemId)
    .as('order_item_returns');

  return db
    .select({
      outsourcingOrderItemId: receipts.outsourcingOrderItemId,
      receivedQuantity:
        sql<number>`greatest(coalesce(${receipts.receivedQty}, 0) - coalesce(${returns.returnedQty}, 0), 0)`
          .mapWith(Number)
          .as('received_quantity'),
    })
    .from(receipts)
    .leftJoin(
      returns,
      eq(returns.outsourcingOrderItemId, receipts.outsourcingOrderItemId),
    )
    .as('received_quantity_by_order_item');
}

/** Bản subquery-table Σ SL nhận theo từng phiếu OS-IN (`totalQuantity`) — không lọc `status` phiếu,
 * cộng thẳng `quantity` mọi dòng của chính phiếu, khớp cách `sentQuantityByOrderIdSubquery`
 * (`outsourcing-orders.query.ts`) cộng SL gửi theo phiếu OS-OUT. LEFT JOIN thẳng vào
 * `getOutsourcingReceipts` (list), không round-trip `Map` riêng. */
export function totalQuantityByReceiptIdSubquery(db: Database) {
  return db
    .select({
      outsourcingReceiptId: outsourcingReceiptItems.outsourcingReceiptId,
      totalQuantity: sql<number>`sum(${outsourcingReceiptItems.quantity})`
        .mapWith(Number)
        .as('total_quantity'),
    })
    .from(outsourcingReceiptItems)
    .groupBy(outsourcingReceiptItems.outsourcingReceiptId)
    .as('total_quantity_by_receipt');
}
