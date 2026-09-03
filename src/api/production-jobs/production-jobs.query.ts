import { and, count, eq, isNull, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  ItemType,
  OperationType,
  OutsourcingReceiptStatus,
  outsourcingOrderItems,
  outsourcingReceiptItems,
  outsourcingReceipts,
  productionJobBomItems,
  ProductionJobLogAction,
  productionJobLogs,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
} from '../../database/schemas';

/** Đẩy Job `IN_PROGRESS → WAITING_QC` khi không còn công đoạn nào của node FG dở — cùng luật đang
 * dùng ở `ProductionJobsService.updateProductionJobOperation`/
 * `ProductionExecutionService.createJobOperationReport` (BUG-079,
 * `docs/decisions/production-lifecycle-closing.md`), gom về đây vì `recomputeOutsourcedOperationProgress`
 * là điểm gọi thứ 3. */
export async function closeJobIfFinalAssemblyDone(
  tx: DbTransaction,
  productionJobId: string,
): Promise<void> {
  const [{ pendingFinalAssemblyCount }] = await tx
    .select({ pendingFinalAssemblyCount: count() })
    .from(productionJobOperations)
    .innerJoin(
      productionJobBomItems,
      eq(
        productionJobBomItems.id,
        productionJobOperations.productionJobBomItemId,
      ),
    )
    .where(
      and(
        eq(productionJobOperations.productionJobId, productionJobId),
        eq(productionJobBomItems.itemType, ItemType.FG),
        isNull(productionJobOperations.completedDate),
      ),
    );

  if (pendingFinalAssemblyCount === 0) {
    const [closedJob] = await tx
      .update(productionJobs)
      .set({ status: ProductionJobStatus.WAITING_QC })
      .where(
        and(
          eq(productionJobs.id, productionJobId),
          eq(productionJobs.status, ProductionJobStatus.IN_PROGRESS),
        ),
      )
      .returning({ id: productionJobs.id });

    // `performedBy` NULL: mốc này có 3 đường trigger, một trong đó (post OS-IN) không có actor
    // người thật — lý lẽ đầy đủ ở doc bảng `production_job_logs`.
    if (closedJob) {
      await tx.insert(productionJobLogs).values({
        productionJobId,
        action: ProductionJobLogAction.WAITING_QC,
        content: 'Hoàn thành toàn bộ công đoạn Cấp 0 — chuyển sang chờ QC',
        performedBy: null,
      });
    }
  }
}

/** Đếm công đoạn (mọi loại, không lọc node FG) của Job chưa `completedDate` — dùng làm gate bổ sung
 * cho `closeJobIfQcCovered` (`oqc.query.ts`): trước đây hàm đó chỉ đếm dòng `quality_inspections`
 * đã đóng, không đếm công đoạn nào thật sự xong, nên 1 công đoạn `OUTSOURCE` có IQC `COMPLETED` có
 * thể đẩy nhầm cả Job sang `WAITING_DELIVERY` dù công đoạn khác còn dở
 * (`docs/decisions/outsourced-operation-progress-writeback.md`). */
export async function countPendingJobOperations(
  db: Database | DbTransaction,
  productionJobId: string,
): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(productionJobOperations)
    .where(
      and(
        eq(productionJobOperations.productionJobId, productionJobId),
        isNull(productionJobOperations.completedDate),
      ),
    );

  return total;
}

/**
 * Tính lại `completedQuantity`/`completedDate` của một công đoạn `OUTSOURCE` từ Σ SL đã nhận về
 * (OS-IN `POSTED` trỏ đúng công đoạn) — nguồn ghi duy nhất cho 2 cột này ở nhánh gia công ngoài,
 * đối xứng `ProductionExecutionService.createJobOperationReport`/
 * `ProductionJobsService.updateProductionJobOperation` ở nhánh trong nhà. Gọi trong CÙNG `tx` với
 * `create`/`cancel` OS-IN (`OutsourcingReceiptsService`) — xem
 * `docs/decisions/outsourced-operation-progress-writeback.md`. Không suy `rejectedQuantity` từ IQC
 * — giữ nguyên 0, cùng lý do trong decision doc.
 */
export async function recomputeOutsourcedOperationProgress(
  tx: DbTransaction,
  productionJobOperationId: string,
): Promise<void> {
  const [operation] = await tx
    .select({
      type: productionJobOperations.type,
      productionJobId: productionJobOperations.productionJobId,
      itemType: productionJobBomItems.itemType,
      plannedQuantity: productionJobBomItems.plannedQuantity,
    })
    .from(productionJobOperations)
    .innerJoin(
      productionJobBomItems,
      eq(
        productionJobBomItems.id,
        productionJobOperations.productionJobBomItemId,
      ),
    )
    .where(eq(productionJobOperations.id, productionJobOperationId))
    .for('update');

  // Công đoạn có thể đã bị hard-delete (FK `outsourcing_order_items.production_job_operation_id`
  // về NULL) hoặc lỡ trỏ nhầm công đoạn INHOUSE — bỏ qua, không đè số do report tay cộng dồn.
  if (!operation || operation.type !== OperationType.OUTSOURCE) {
    return;
  }

  const [{ receivedQuantity }] = await tx
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
    .where(
      eq(
        outsourcingOrderItems.productionJobOperationId,
        productionJobOperationId,
      ),
    );

  const isCompleted = receivedQuantity >= operation.plannedQuantity;

  await tx
    .update(productionJobOperations)
    .set({
      completedQuantity: receivedQuantity,
      completedDate: isCompleted ? new Date() : null,
    })
    .where(eq(productionJobOperations.id, productionJobOperationId));

  if (isCompleted && operation.itemType === ItemType.FG) {
    await closeJobIfFinalAssemblyDone(tx, operation.productionJobId);
  }
}
