import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  outsourcingReceipts,
} from '../../database/schemas';

/** Aggregate SL đã nhận theo OS-OUT, chỉ OS-IN `POSTED` — dùng trong
 * `OutsourcingOrdersService.getOutsourcingOrders` (lọc/hiển thị `progress`). Khuôn
 * `orderReceivedQuantitySubquery` (`purchase-orders.query.ts`). */
export function receivedQuantityByOutsourcingOrderSubquery(db: Database) {
  return db
    .select({
      outsourcingOrderId: outsourcingReceipts.outsourcingOrderId,
      receivedQuantity: sql<number>`sum(${outsourcingReceipts.quantity})`
        .mapWith(Number)
        .as('received_quantity'),
    })
    .from(outsourcingReceipts)
    .where(eq(outsourcingReceipts.status, InventoryDocumentStatus.POSTED))
    .groupBy(outsourcingReceipts.outsourcingOrderId)
    .as('outsourcing_received_quantity_aggregate');
}

/** Σ SL đã nhận của một OS-OUT theo tập `statuses` truyền vào — `create` kiểm sớm với
 * `[DRAFT, POSTED]`, `post` kiểm chốt trong transaction với `[POSTED]` + `excludeReceiptId` (loại
 * trừ chính dòng đang `post`). Khuôn `getReceivedQuantityByPurchaseOrderItemId`
 * (`purchase-orders.query.ts`) — cũng tham số hoá `statuses` đúng vì lý do này. */
export async function getReceivedQuantityByOutsourcingOrderId(
  db: Database | DbTransaction,
  params: {
    outsourcingOrderId: string;
    statuses: InventoryDocumentStatus[];
    excludeReceiptId?: string;
  },
): Promise<number> {
  const [row] = await db
    .select({
      total:
        sql<number>`coalesce(sum(${outsourcingReceipts.quantity}), 0)`.mapWith(
          Number,
        ),
    })
    .from(outsourcingReceipts)
    .where(
      and(
        eq(outsourcingReceipts.outsourcingOrderId, params.outsourcingOrderId),
        inArray(outsourcingReceipts.status, params.statuses),
        params.excludeReceiptId
          ? ne(outsourcingReceipts.id, params.excludeReceiptId)
          : undefined,
      ),
    );

  return row?.total ?? 0;
}
