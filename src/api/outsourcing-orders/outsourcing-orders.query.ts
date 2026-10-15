import { and, eq, ne, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
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
  supplierReturns,
} from '../../database/schemas';

/** Σ SL đã gửi theo từng công đoạn Job, LEFT JOIN thẳng vào popup `getOutsourceableOperations`.
 * Tính mọi phiếu chưa `CANCELLED`. Chỉ để hiển thị: `createOutsourcingOrder` không dùng nó để chặn
 * gửi vượt định mức. */
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

/** Σ SL gửi theo từng phiếu OS-OUT (`totalQuantity`) cho list và detail. Không lọc `status`, nên
 * phiếu `CANCELLED` vẫn hiện đủ SL (khác bản theo công đoạn Job ở trên, bỏ phiếu `CANCELLED`). */
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

/** Σ SL đã nhận theo từng phiếu OS-OUT (`receivedQuantity`) cho list và detail.
 *
 * Rules:
 * - Chỉ cộng OS-IN `POSTED`, trừ SL `supplier_returns` `POSTED` nối qua `outsourcingReceiptItemId`,
 *   sàn 0.
 * - Cùng cách tính với `getReceivedQuantityByOrderItemIds` (`outsourcing-receipts.query.ts`), chỉ
 *   khác gom theo phiếu thay vì theo dòng.
 */
export function receivedQuantityByOrderIdSubquery(db: Database) {
  const receipts = db
    .select({
      outsourcingOrderId: outsourcingOrderItems.outsourcingOrderId,
      receivedQty:
        sql<number>`coalesce(sum(${outsourcingReceiptItems.quantity}), 0)`
          .mapWith(Number)
          .as('received_qty'),
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
    .as('order_receipts');

  const returns = db
    .select({
      outsourcingOrderId: outsourcingOrderItems.outsourcingOrderId,
      returnedQty: sql<number>`coalesce(sum(${supplierReturns.quantity}), 0)`
        .mapWith(Number)
        .as('returned_qty'),
    })
    .from(supplierReturns)
    .innerJoin(
      outsourcingReceiptItems,
      eq(outsourcingReceiptItems.id, supplierReturns.outsourcingReceiptItemId),
    )
    .innerJoin(
      outsourcingOrderItems,
      eq(
        outsourcingOrderItems.id,
        outsourcingReceiptItems.outsourcingOrderItemId,
      ),
    )
    .where(eq(supplierReturns.status, InventoryDocumentStatus.POSTED))
    .groupBy(outsourcingOrderItems.outsourcingOrderId)
    .as('order_returns');

  return db
    .select({
      outsourcingOrderId: receipts.outsourcingOrderId,
      receivedQuantity:
        sql<number>`greatest(coalesce(${receipts.receivedQty}, 0) - coalesce(${returns.returnedQty}, 0), 0)`
          .mapWith(Number)
          .as('received_quantity'),
    })
    .from(receipts)
    .leftJoin(
      returns,
      eq(returns.outsourcingOrderId, receipts.outsourcingOrderId),
    )
    .as('received_quantity_by_order');
}

/** Còn IQC chưa `COMPLETED` nào sinh từ OS-IN `POSTED` của phiếu này không;
 * `recomputeOutsourcingOrderStatus` dùng để chọn `WAITING_QC` hay `COMPLETED`. Nối qua
 * `quality_inspections.originId = outsourcing_receipt_items.id` (`originType` polymorphic). */
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
 * Tính lại `status` (= tiến độ nhận hàng) của một phiếu OS-OUT từ SL gửi/nhận và IQC còn treo, rồi
 * `UPDATE`. Nguồn ghi duy nhất cho `PARTIAL`/`WAITING_QC`/`COMPLETED`.
 *
 * Rules:
 * - SL nhận đã trừ `supplier_returns` `POSTED`, nên trả hàng lỗi có thể lùi status về
 *   `PARTIAL`/`SENT` và mở lại hạn mức cho NCC giao bù (`docs/CODEMAPS/inventory.md`, State flows).
 * - Gọi trong cùng `tx` với thao tác làm đổi dữ liệu: `OutsourcingReceiptsService`
 *   (`createOutsourcingReceipt`, `cancelOutsourcingReceipt`), `IqcService.confirmIqc`,
 *   `SupplierReturnsService.postSupplierReturn`.
 * - Phiếu `CANCELLED` bị bỏ qua, không hồi sinh.
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

  // Không tái dùng `sentQuantityByOrderIdSubquery`/`receivedQuantityByOrderIdSubquery`: chúng GROUP
  // BY cả bảng, còn ở đây chỉ cần một phiếu nên lọc WHERE trước khi SUM rẻ hơn. SL trả NCC được
  // trừ để hàng QC fail bị trả không tính là "đã nhận".
  const [
    [{ sentQuantity }],
    [{ receivedQuantity: rawReceivedQuantity }],
    [{ returnedQuantity }],
  ] = await Promise.all([
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
    tx
      .select({
        returnedQuantity:
          sql<number>`coalesce(sum(${supplierReturns.quantity}), 0)`.mapWith(
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
        supplierReturns,
        eq(
          supplierReturns.outsourcingReceiptItemId,
          outsourcingReceiptItems.id,
        ),
      )
      .where(
        and(
          eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId),
          eq(supplierReturns.status, InventoryDocumentStatus.POSTED),
        ),
      ),
  ]);

  const receivedQuantity = Math.max(rawReceivedQuantity - returnedQuantity, 0);

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

/** Còn OS-IN chưa `CANCELLED` nào trỏ tới dòng của phiếu không; `cancelOutsourcingOrder` chặn huỷ
 * (`E169`) cho tới khi huỷ hết OS-IN con. */
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
