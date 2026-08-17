import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  iqcInspections,
  IqcStatus,
  outsourcingOrderItems,
  outsourcingOrders,
  outsourcingReceiptItems,
  outsourcingReceipts,
  productionJobBomItems,
} from '../../database/schemas';
import {
  type PlannedQuantityNode,
  resolvePlannedQuantities,
} from '../production-jobs/production-job-planned-quantity';

/** Σ SL đã gửi theo từng công đoạn Job (`productionJobOperationId`) — dùng cho popup "chọn part
 * cần gia công" và validate `E184` (gửi vượt định mức). `statuses` luôn chỉ còn `[POSTED]` (không
 * còn phiếu nào ở `DRAFT`). `excludeOrderId` bắt buộc phải truyền = chính phiếu đang tạo khi gọi từ
 * transaction `create` — header đã `INSERT` với `POSTED` ngay trong `tx` đó nên nhìn thấy chính dòng
 * của nó, không loại sẽ bị cộng dồn hai lần. Bỏ qua id `null` — dòng OS-OUT có
 * `productionJobOperationId` đã `set null` (Job bị hard-delete) không còn gì để chặn. */
export async function getSentQuantityByJobOperationIds(
  db: Database | DbTransaction,
  params: {
    productionJobOperationIds: string[];
    statuses: InventoryDocumentStatus[];
    excludeOrderId?: string;
  },
): Promise<Map<string, number>> {
  if (!params.productionJobOperationIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      productionJobOperationId: outsourcingOrderItems.productionJobOperationId,
      sent: sql<number>`coalesce(sum(${outsourcingOrderItems.quantity}), 0)`.mapWith(
        Number,
      ),
    })
    .from(outsourcingOrderItems)
    .innerJoin(
      outsourcingOrders,
      eq(outsourcingOrders.id, outsourcingOrderItems.outsourcingOrderId),
    )
    .where(
      and(
        inArray(
          outsourcingOrderItems.productionJobOperationId,
          params.productionJobOperationIds,
        ),
        inArray(outsourcingOrders.status, params.statuses),
        params.excludeOrderId
          ? ne(outsourcingOrders.id, params.excludeOrderId)
          : undefined,
      ),
    )
    .groupBy(outsourcingOrderItems.productionJobOperationId);

  const sentByOperationId = new Map<string, number>();
  for (const row of rows) {
    if (row.productionJobOperationId !== null) {
      sentByOperationId.set(row.productionJobOperationId, row.sent);
    }
  }

  return sentByOperationId;
}

/** Bản subquery-table của `getSentQuantityByJobOperationIds` — cùng logic SUM, cố định `POSTED`,
 * không tham số hoá `excludeOrderId` — để LEFT JOIN thẳng vào SELECT hiển thị
 * (`getOutsourceableOperations`) thay vì round-trip `Map` riêng, đúng khuôn `orderLineStatsSubquery`.
 * Nơi validate `E184` (`create`) vẫn dùng bản `Map` vì cần `excludeOrderId`. */
export function sentQuantityByJobOperationSubquery(db: Database) {
  return db
    .select({
      productionJobOperationId: outsourcingOrderItems.productionJobOperationId,
      sentQuantity:
        sql<number>`coalesce(sum(${outsourcingOrderItems.quantity}), 0)`
          .mapWith(Number)
          .as('sent_quantity'),
    })
    .from(outsourcingOrderItems)
    .innerJoin(
      outsourcingOrders,
      eq(outsourcingOrders.id, outsourcingOrderItems.outsourcingOrderId),
    )
    .where(eq(outsourcingOrders.status, InventoryDocumentStatus.POSTED))
    .groupBy(outsourcingOrderItems.productionJobOperationId)
    .as('sent_quantity_by_job_operation');
}

/** Gom theo Job vì `resolvePlannedQuantities` nhân theo SL của đúng Job đó — 1 lượt query cho mọi
 * Job, không phải mỗi Job một lượt. */
export async function getPlannedQuantitiesByJob(
  db: Database | DbTransaction,
  jobQuantityByJobId: Map<string, number>,
): Promise<Map<string, Map<string, number>>> {
  const jobIds = [...jobQuantityByJobId.keys()];
  if (!jobIds.length) {
    return new Map();
  }

  const nodes = await db.query.productionJobBomItems.findMany({
    where: inArray(productionJobBomItems.productionJobId, jobIds),
    columns: {
      id: true,
      parentId: true,
      quantity: true,
      productionJobId: true,
    },
  });

  const nodesByJobId = new Map<string, PlannedQuantityNode[]>();
  for (const node of nodes) {
    const group = nodesByJobId.get(node.productionJobId);
    if (group) {
      group.push(node);
    } else {
      nodesByJobId.set(node.productionJobId, [node]);
    }
  }

  return new Map(
    [...jobQuantityByJobId].map(([jobId, jobQuantity]) => [
      jobId,
      resolvePlannedQuantities(nodesByJobId.get(jobId) ?? [], jobQuantity),
    ]),
  );
}

/** Thống kê theo dòng OS-OUT, gộp lên mức phiếu — nguồn cho `progress` (OS-OUT). `received` chỉ
 * cộng dòng OS-IN thuộc phiếu `POSTED` (điều kiện nằm ở `ON`, không phải `WHERE` — dòng OS-OUT
 * chưa từng được nhận vẫn phải xuất hiện với `received = 0`, không bị LEFT JOIN nuốt mất). Ép về 0
 * bằng `CASE` thay vì lọc ở `WHERE` vì dòng OS-IN có thể tồn tại (khác `DRAFT`) mà không được tính. */
export function orderLineStatsSubquery(db: Database) {
  const lineReceived = db
    .select({
      outsourcingOrderId: outsourcingOrderItems.outsourcingOrderId,
      sent: outsourcingOrderItems.quantity,
      received:
        sql<number>`coalesce(sum(case when ${outsourcingReceipts.id} is not null then ${outsourcingReceiptItems.quantity} else 0 end), 0)`.as(
          'received',
        ),
    })
    .from(outsourcingOrderItems)
    .leftJoin(
      outsourcingReceiptItems,
      eq(
        outsourcingReceiptItems.outsourcingOrderItemId,
        outsourcingOrderItems.id,
      ),
    )
    .leftJoin(
      outsourcingReceipts,
      and(
        eq(
          outsourcingReceipts.id,
          outsourcingReceiptItems.outsourcingReceiptId,
        ),
        eq(outsourcingReceipts.status, InventoryDocumentStatus.POSTED),
      ),
    )
    .groupBy(
      outsourcingOrderItems.id,
      outsourcingOrderItems.outsourcingOrderId,
      outsourcingOrderItems.quantity,
    )
    .as('outsourcing_order_line_received');

  return db
    .select({
      outsourcingOrderId: lineReceived.outsourcingOrderId,
      sentQuantity: sql<number>`sum(${lineReceived.sent})`
        .mapWith(Number)
        .as('sent_quantity'),
      receivedQuantity: sql<number>`sum(${lineReceived.received})`
        .mapWith(Number)
        .as('received_quantity'),
      // Còn dòng chưa nhận đủ.
      openLineCount:
        sql<number>`count(*) filter (where ${lineReceived.received} < ${lineReceived.sent})`
          .mapWith(Number)
          .as('open_line_count'),
      receivedLineCount:
        sql<number>`count(*) filter (where ${lineReceived.received} > 0)`
          .mapWith(Number)
          .as('received_line_count'),
    })
    .from(lineReceived)
    .groupBy(lineReceived.outsourcingOrderId)
    .as('outsourcing_order_line_stats');
}

/** Danh sách `outsourcingOrderId` còn ≥ 1 dòng IQC (sinh từ OS-IN `POSTED` của chính phiếu đó,
 * khớp `itemId`) chưa `COMPLETED` — dùng LEFT JOIN cho `progress = WAITING_QC` ở list. Khớp theo
 * `(outsourcingReceiptId, itemId)` vì `iqc_inspections` không có FK trực tiếp tới
 * `outsourcing_receipt_items` — độ chính xác ở mức phiếu, không ở mức dòng (đủ cho một nhãn trạng
 * thái hiển thị, xem `docs/domains/inventory.md`). */
export function orderPendingIqcSubquery(db: Database) {
  return db
    .selectDistinct({
      outsourcingOrderId: outsourcingOrderItems.outsourcingOrderId,
    })
    .from(outsourcingOrderItems)
    .innerJoin(
      outsourcingReceiptItems,
      eq(
        outsourcingReceiptItems.outsourcingOrderItemId,
        outsourcingOrderItems.id,
      ),
    )
    .innerJoin(
      outsourcingReceipts,
      and(
        eq(
          outsourcingReceipts.id,
          outsourcingReceiptItems.outsourcingReceiptId,
        ),
        eq(outsourcingReceipts.status, InventoryDocumentStatus.POSTED),
      ),
    )
    .innerJoin(
      iqcInspections,
      and(
        eq(iqcInspections.outsourcingReceiptId, outsourcingReceipts.id),
        eq(iqcInspections.itemId, outsourcingOrderItems.itemId),
        ne(iqcInspections.status, IqcStatus.COMPLETED),
      ),
    )
    .as('outsourcing_order_pending_iqc');
}

/** Bản đơn-phiếu của `orderPendingIqcSubquery` — dùng ở `getOutsourcingOrder` (chi tiết), không
 * cần dựng subquery cho cả bảng. */
export async function hasPendingIqcForOrder(
  db: Database | DbTransaction,
  outsourcingOrderId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ one: sql`1` })
    .from(outsourcingOrderItems)
    .innerJoin(
      outsourcingReceiptItems,
      eq(
        outsourcingReceiptItems.outsourcingOrderItemId,
        outsourcingOrderItems.id,
      ),
    )
    .innerJoin(
      outsourcingReceipts,
      and(
        eq(
          outsourcingReceipts.id,
          outsourcingReceiptItems.outsourcingReceiptId,
        ),
        eq(outsourcingReceipts.status, InventoryDocumentStatus.POSTED),
      ),
    )
    .innerJoin(
      iqcInspections,
      and(
        eq(iqcInspections.outsourcingReceiptId, outsourcingReceipts.id),
        eq(iqcInspections.itemId, outsourcingOrderItems.itemId),
        ne(iqcInspections.status, IqcStatus.COMPLETED),
      ),
    )
    .where(eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId))
    .limit(1);

  return !!row;
}

/** Huỷ OS-OUT đã `POSTED` bị chặn (`E169`) nếu còn dòng OS-IN nào chưa `CANCELLED` trỏ tới bất kỳ
 * dòng nào của phiếu — phải huỷ hết OS-IN con trước. */
export async function hasActiveReceiptsForOrder(
  db: Database | DbTransaction,
  outsourcingOrderId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ one: sql`1` })
    .from(outsourcingOrderItems)
    .innerJoin(
      outsourcingReceiptItems,
      eq(
        outsourcingReceiptItems.outsourcingOrderItemId,
        outsourcingOrderItems.id,
      ),
    )
    .innerJoin(
      outsourcingReceipts,
      eq(outsourcingReceipts.id, outsourcingReceiptItems.outsourcingReceiptId),
    )
    .where(
      and(
        eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId),
        ne(outsourcingReceipts.status, InventoryDocumentStatus.CANCELLED),
      ),
    )
    .limit(1);

  return !!row;
}
