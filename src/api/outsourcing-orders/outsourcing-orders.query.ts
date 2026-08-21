import { and, eq, ne, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  OutsourcingOrderStatus,
  outsourcingOrderItems,
  outsourcingOrders,
  OutsourcingReceiptStatus,
  outsourcingReceiptItems,
  outsourcingReceipts,
} from '../../database/schemas';

/** Σ SL đã gửi theo từng công đoạn Job — dùng cho popup "chọn part cần gia công"
 * (`getOutsourceableOperations`), LEFT JOIN thẳng vào SELECT hiển thị thay vì round-trip `Map`
 * riêng. Chỉ tính phiếu `POSTED` (không còn phiếu nào ở `DRAFT`). Không còn dùng để validate —
 * `createOutsourcingOrder` nhận dòng do client gửi đủ cột, không tự tính lại số đã gửi
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
    .where(eq(outsourcingOrders.status, OutsourcingOrderStatus.POSTED))
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
        ne(outsourcingReceipts.status, OutsourcingReceiptStatus.CANCELLED),
      ),
    )
    .limit(1);

  return !!row;
}
