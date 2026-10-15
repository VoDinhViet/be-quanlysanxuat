import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  outsourcingReceiptItems,
  outsourcingReceipts,
  OutsourcingReceiptStatus,
  supplierReturns,
} from '../../database/schemas';

/** Σ SL đã nhận theo từng dòng OS-OUT (`outsourcingOrderItemId`), dùng để validate `E172` khi tạo
 * OS-IN. Chỉ cộng phiếu `POSTED`, trừ SL `supplier_returns` `POSTED` nối qua
 * `supplierReturns.outsourcingReceiptItemId`, sàn 0. */
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
        eq(
          outsourcingReceiptItems.id,
          supplierReturns.outsourcingReceiptItemId,
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

/** Bản subquery của `getReceivedQuantityByOrderItemIds` (cùng cách tính) để LEFT JOIN thẳng vào
 * SELECT hiển thị: `OutsourcingOrdersService.getOrderItems` và
 * `OutsourcingReceiptsService.getPendingOrderItems`. */
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
      eq(outsourcingReceiptItems.id, supplierReturns.outsourcingReceiptItemId),
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

/** Σ SL theo từng phiếu OS-IN (`totalQuantity`) cho `getOutsourcingReceipts`. Không lọc `status`,
 * nên phiếu `CANCELLED` vẫn hiện đủ SL (giống `sentQuantityByOrderIdSubquery` bên OS-OUT). */
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
