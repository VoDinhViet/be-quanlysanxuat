import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  iqcInspections,
  IqcStatus,
  outsourcingReceiptItems,
  outsourcingReceipts,
} from '../../database/schemas';

/** Σ SL đã nhận theo từng dòng OS-OUT (`outsourcingOrderItemId`) — dùng cho popup "chọn hàng cần
 * nhận", validate `E172` (create OS-IN), và tính tiến độ dòng OS-OUT. `statuses` luôn chỉ còn
 * `[POSTED]` (không còn phiếu nào ở `DRAFT`). `excludeReceiptId` bắt buộc phải truyền = chính phiếu
 * đang tạo khi gọi từ transaction `create` — header đã `INSERT` với `POSTED` ngay trong `tx` đó nên
 * nhìn thấy chính dòng của nó, không loại sẽ bị cộng dồn hai lần. */
export async function getReceivedQuantityByOrderItemIds(
  db: Database | DbTransaction,
  params: {
    orderItemIds: string[];
    statuses: InventoryDocumentStatus[];
    excludeReceiptId?: string;
  },
): Promise<Map<string, number>> {
  if (!params.orderItemIds.length) {
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
        inArray(
          outsourcingReceiptItems.outsourcingOrderItemId,
          params.orderItemIds,
        ),
        inArray(outsourcingReceipts.status, params.statuses),
        params.excludeReceiptId
          ? ne(outsourcingReceipts.id, params.excludeReceiptId)
          : undefined,
      ),
    )
    .groupBy(outsourcingReceiptItems.outsourcingOrderItemId);

  return new Map(rows.map((row) => [row.outsourcingOrderItemId, row.received]));
}

/** Tập `outsourcingReceiptId` còn ≥ 1 dòng IQC chưa `COMPLETED` — dùng cho `progress` (OS-IN),
 * tính hàng loạt theo trang thay vì gọi lại mỗi dòng. */
export async function getReceiptIdsWithPendingIqc(
  db: Database | DbTransaction,
  outsourcingReceiptIds: string[],
): Promise<Set<string>> {
  if (!outsourcingReceiptIds.length) {
    return new Set();
  }

  const rows = await db
    .selectDistinct({
      outsourcingReceiptId: iqcInspections.outsourcingReceiptId,
    })
    .from(iqcInspections)
    .where(
      and(
        inArray(iqcInspections.outsourcingReceiptId, outsourcingReceiptIds),
        ne(iqcInspections.status, IqcStatus.COMPLETED),
      ),
    );

  return new Set(
    rows.flatMap((row) =>
      row.outsourcingReceiptId ? [row.outsourcingReceiptId] : [],
    ),
  );
}
