import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  outsourcingReceiptItems,
  outsourcingReceipts,
  OutsourcingReceiptStatus,
} from '../../database/schemas';

/** Σ SL đã nhận theo từng dòng OS-OUT (`outsourcingOrderItemId`) — dùng cho popup "chọn hàng cần
 * nhận", validate `E172` (create OS-IN), và tính tiến độ dòng OS-OUT. Chỉ tính phiếu `POSTED`
 * (không còn phiếu nào ở `DRAFT`). */
export async function getReceivedQuantityByOrderItemIds(
  db: Database | DbTransaction,
  orderItemIds: string[],
): Promise<Map<string, number>> {
  if (!orderItemIds.length) {
    return new Map();
  }

  const rows = await db
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
      eq(outsourcingReceipts.id, outsourcingReceiptItems.outsourcingReceiptId),
    )
    .where(
      and(
        inArray(outsourcingReceiptItems.outsourcingOrderItemId, orderItemIds),
        eq(outsourcingReceipts.status, OutsourcingReceiptStatus.POSTED),
      ),
    )
    .groupBy(outsourcingReceiptItems.outsourcingOrderItemId);

  return new Map(rows.map((row) => [row.outsourcingOrderItemId, row.received]));
}

/** Bản subquery-table của `getReceivedQuantityByOrderItemIds` — cùng logic SUM, cố định `POSTED` —
 * để LEFT JOIN thẳng vào SELECT hiển thị (`OutsourcingOrdersService.getOrderItems`) thay vì
 * round-trip `Map` riêng. Nơi validate `E172` (create OS-IN) vẫn dùng bản `Map` vì không có SELECT
 * nào để join vào. */
export function receivedQuantityByOrderItemIdSubquery(db: Database) {
  return db
    .select({
      outsourcingOrderItemId: outsourcingReceiptItems.outsourcingOrderItemId,
      receivedQuantity:
        sql<number>`coalesce(sum(${outsourcingReceiptItems.quantity}), 0)`
          .mapWith(Number)
          .as('received_quantity'),
    })
    .from(outsourcingReceiptItems)
    .innerJoin(
      outsourcingReceipts,
      eq(outsourcingReceipts.id, outsourcingReceiptItems.outsourcingReceiptId),
    )
    .where(eq(outsourcingReceipts.status, OutsourcingReceiptStatus.POSTED))
    .groupBy(outsourcingReceiptItems.outsourcingOrderItemId)
    .as('received_quantity_by_order_item');
}
