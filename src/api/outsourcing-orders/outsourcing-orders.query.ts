import { and, eq, ne, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  OutsourcingOrderStatus,
  outsourcingOrderItems,
  outsourcingOrders,
  OutsourcingReceiptStatus,
  outsourcingReceiptItems,
  outsourcingReceipts,
  QualityInspectionOriginType,
  QualityInspectionStatus,
  QualityInspectionType,
  qualityInspections,
} from '../../database/schemas';

/** Σ SL đã gửi theo từng công đoạn Job — dùng cho popup "chọn part cần gia công"
 * (`getOutsourceableOperations`), LEFT JOIN thẳng vào SELECT hiển thị thay vì round-trip `Map`
 * riêng. Tính mọi phiếu chưa `CANCELLED` (4 trạng thái sống — không còn chỉ `POSTED`, status đã gộp
 * tiến độ, `docs/decisions/outsourcing-order-status-progress-merge.md`). Không còn dùng để validate
 * — `createOutsourcingOrder` nhận dòng do client gửi đủ cột, không tự tính lại số đã gửi
 * (`docs/decisions/outsourcing-no-draft.md`). */
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
    .where(ne(outsourcingOrders.status, OutsourcingOrderStatus.CANCELLED))
    .groupBy(outsourcingOrderItems.productionJobOperationId)
    .as('sent_quantity_by_job_operation');
}

/** Bản subquery-table Σ SL gửi theo từng phiếu OS-OUT (`totalQuantity`) — không lọc `status` phiếu
 * (khác bản trên theo `productionJobOperationId`, chỉ tính `POSTED`), khớp cách `getOutsourcingOrder`
 * (chi tiết) cộng thẳng `quantity` mọi dòng của chính phiếu, kể cả phiếu đã `CANCELLED`. LEFT JOIN
 * thẳng vào `getOutsourcingOrders` (list), không round-trip `Map` riêng. */
export function sentQuantityByOrderIdSubquery(db: Database) {
  return db
    .select({
      outsourcingOrderId: outsourcingOrderItems.outsourcingOrderId,
      totalQuantity: sql<number>`sum(${outsourcingOrderItems.quantity})`
        .mapWith(Number)
        .as('total_quantity'),
    })
    .from(outsourcingOrderItems)
    .groupBy(outsourcingOrderItems.outsourcingOrderId)
    .as('sent_quantity_by_order');
}

/** Bản subquery-table Σ SL đã nhận theo từng phiếu OS-OUT (`receivedQuantity`) — gộp mọi dòng OS-IN
 * `POSTED` trỏ tới bất kỳ dòng nào của phiếu, khớp cách lọc `status` của
 * `getReceivedQuantityByOrderItemIds` (`outsourcing-receipts.query.ts`), chỉ khác gom theo phiếu
 * OS-OUT thay vì theo từng dòng. LEFT JOIN thẳng vào `getOutsourcingOrders` (list). */
export function receivedQuantityByOrderIdSubquery(db: Database) {
  return db
    .select({
      outsourcingOrderId: outsourcingOrderItems.outsourcingOrderId,
      receivedQuantity: sql<number>`sum(${outsourcingReceiptItems.quantity})`
        .mapWith(Number)
        .as('received_quantity'),
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
        eq(outsourcingReceipts.status, OutsourcingReceiptStatus.POSTED),
      ),
    )
    .groupBy(outsourcingOrderItems.outsourcingOrderId)
    .as('received_quantity_by_order');
}

/** Còn ≥ 1 dòng IQC (sinh từ OS-IN `POSTED` của chính phiếu này) chưa `COMPLETED` không — dùng
 * trong `recomputeOutsourcingOrderStatus` để quyết định `WAITING_QC` hay `COMPLETED`. Origin
 * polymorphic (`quality_inspections.originType = OUTSOURCING_RECEIPT_ITEM`) khớp thẳng
 * `outsourcing_receipt_items.id`, chính xác tới từng dòng OS-IN — cùng join pattern
 * `OutsourcingReceiptsService.hasLinkedIqc`. */
async function hasPendingIqcForOrder(
  tx: DbTransaction,
  outsourcingOrderId: string,
): Promise<boolean> {
  const [row] = await tx
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
        eq(outsourcingReceipts.status, OutsourcingReceiptStatus.POSTED),
      ),
    )
    .innerJoin(
      qualityInspections,
      and(
        eq(
          qualityInspections.originType,
          QualityInspectionOriginType.OUTSOURCING_RECEIPT_ITEM,
        ),
        eq(qualityInspections.originId, outsourcingReceiptItems.id),
        eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
        ne(qualityInspections.status, QualityInspectionStatus.COMPLETED),
      ),
    )
    .where(eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId))
    .limit(1);

  return !!row;
}

/**
 * Tính lại `status` (= tiến độ nhận hàng) của 1 phiếu OS-OUT từ dữ liệu thật (SL gửi/nhận/IQC còn
 * treo) rồi `UPDATE` — nguồn ghi duy nhất cho 3 giá trị `PARTIAL`/`WAITING_QC`/`COMPLETED`
 * (`docs/decisions/outsourcing-order-status-progress-merge.md`). Gọi từ
 * `OutsourcingReceiptsService.createOutsourcingReceipt`/`cancelOutsourcingReceipt` (SL nhận đổi) và
 * `IqcService.confirmIqc` (IQC treo đổi) — luôn trong cùng `tx` với thao tác vừa gây ra thay đổi đó,
 * không phải cron/job riêng. Bỏ qua nếu phiếu đã `CANCELLED` — không hồi sinh phiếu đã huỷ.
 */
export async function recomputeOutsourcingOrderStatus(
  tx: DbTransaction,
  outsourcingOrderId: string,
): Promise<void> {
  const [order] = await tx
    .select({ status: outsourcingOrders.status })
    .from(outsourcingOrders)
    .where(eq(outsourcingOrders.id, outsourcingOrderId))
    .limit(1);

  if (!order || order.status === OutsourcingOrderStatus.CANCELLED) {
    return;
  }

  // Không tái dùng sentQuantityByOrderIdSubquery/receivedQuantityByOrderIdSubquery ở trên — 2 hàm đó
  // GROUP BY toàn bộ bảng (khớp shape LEFT JOIN của list/detail), quét cả những phiếu không liên
  // quan; ở đây chỉ cần đúng 1 phiếu nên lọc WHERE trước khi SUM rẻ hơn. Hai truy vấn độc lập, chạy
  // song song.
  const [[{ sentQuantity }], [{ receivedQuantity }]] = await Promise.all([
    tx
      .select({
        sentQuantity:
          sql<number>`coalesce(sum(${outsourcingOrderItems.quantity}), 0)`.mapWith(
            Number,
          ),
      })
      .from(outsourcingOrderItems)
      .where(eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId)),
    tx
      .select({
        receivedQuantity:
          sql<number>`coalesce(sum(${outsourcingReceiptItems.quantity}), 0)`.mapWith(
            Number,
          ),
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
          eq(outsourcingReceipts.status, OutsourcingReceiptStatus.POSTED),
        ),
      )
      .where(eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId)),
  ]);

  let status: OutsourcingOrderStatus;
  if (receivedQuantity < sentQuantity) {
    status =
      receivedQuantity > 0
        ? OutsourcingOrderStatus.PARTIAL
        : OutsourcingOrderStatus.SENT;
  } else {
    const hasPendingIqc = await hasPendingIqcForOrder(tx, outsourcingOrderId);
    status = hasPendingIqc
      ? OutsourcingOrderStatus.WAITING_QC
      : OutsourcingOrderStatus.COMPLETED;
  }

  await tx
    .update(outsourcingOrders)
    .set({ status })
    .where(eq(outsourcingOrders.id, outsourcingOrderId));
}

/** Huỷ OS-OUT chưa `CANCELLED` bị chặn (`E169`) nếu còn dòng OS-IN nào chưa `CANCELLED` trỏ tới bất
 * kỳ dòng nào của phiếu — phải huỷ hết OS-IN con trước. */
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
        ne(outsourcingReceipts.status, OutsourcingReceiptStatus.CANCELLED),
      ),
    )
    .limit(1);

  return !!row;
}
