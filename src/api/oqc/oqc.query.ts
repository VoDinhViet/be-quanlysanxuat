import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  OqcDisposition,
  productionJobBomItems,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  QualityInspectionType,
  qualityInspections,
} from '../../database/schemas';
import { createProductionReceiptForJob } from '../inventory-receipts/inventory-receipts.write';
import { countPendingJobOperations } from '../production-jobs/production-jobs.query';

/** Dòng `disposition = SCRAP` không tính vào SL đã xin QC của một công đoạn — hàng đã loại bỏ hẳn,
 * giải phóng lại quota lô để xưởng làm bù (`docs/domains/quality-oqc.md`). `disposition` chỉ khác
 * `null` khi `decision = FAIL` (`chk_quality_inspections_disposition_requires_fail`), nên chỉ cần
 * lọc trên `disposition` — không cần đụng tới `decision`. `quality_inspections.disposition` mirror
 * đúng attempt mới nhất (`docs/decisions/qc-data-model.md`), nên lọc trên case row cho cùng kết
 * quả như lọc trên attempt mới nhất mà không cần join thêm. */
const notScrapped = or(
  isNull(qualityInspections.disposition),
  ne(qualityInspections.disposition, OqcDisposition.SCRAP),
);

/** Σ `quantity` mọi OQC (trừ `disposition = SCRAP`) của riêng một công đoạn — dùng để validate
 * `E198` khi tạo OQC mới (`OqcService.createOqcForJob`). */
export async function getInspectedQuantityByOperationId(
  db: Database | DbTransaction,
  productionJobOperationId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total:
        sql<number>`coalesce(sum(${qualityInspections.quantity}), 0)`.mapWith(
          Number,
        ),
    })
    .from(qualityInspections)
    .where(
      and(
        eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
        eq(
          qualityInspections.productionJobOperationId,
          productionJobOperationId,
        ),
        notScrapped,
      ),
    );

  return row?.total ?? 0;
}

/** Σ `quantity` mọi OQC (trừ `disposition = SCRAP`) của MỌI công đoạn thuộc cùng một node BOM (join
 * qua `productionJobOperationId`) — dùng để validate `E176`: 1 node có thể có nhiều công đoạn (as-
 * used), nhưng cùng là 1 part vật lý, nên trần SL kế hoạch phải tính gộp qua node, không phải riêng
 * từng công đoạn (đó là việc của `E198`). */
export async function getInspectedQuantityByBomItemId(
  db: Database | DbTransaction,
  productionJobBomItemId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total:
        sql<number>`coalesce(sum(${qualityInspections.quantity}), 0)`.mapWith(
          Number,
        ),
    })
    .from(qualityInspections)
    .innerJoin(
      productionJobOperations,
      eq(
        productionJobOperations.id,
        qualityInspections.productionJobOperationId,
      ),
    )
    .where(
      and(
        eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
        eq(
          productionJobOperations.productionJobBomItemId,
          productionJobBomItemId,
        ),
        notScrapped,
      ),
    );

  return row?.total ?? 0;
}

/** Điều kiện "Job đã QC xong hết" dùng cho gate nhập kho TP (`E196`/`E209`, xem
 * `InventoryReceiptsService.ensureProductionReceiptOqcCleared`) và gate giao hàng (`E205`,
 * `OutboundOrdersService.ensureAllJobsQcCompleted`). Gộp cả hai nhánh QC qua neo chung
 * `productionJobOperationId` — công đoạn `INHOUSE` chỉ có thể có dòng `OQC` trỏ vào, công đoạn
 * `OUTSOURCE` chỉ có thể có dòng `IQC` sinh từ OS-IN (xem
 * `IqcService.createInspectionsFromOutsourcingReceipt`) trỏ vào — hai tập không giao nhau, nên
 * LEFT JOIN theo đúng một cột này tự nhiên gộp đúng, không cần lọc `inspectionType` ở đây
 * (`docs/decisions/qc-data-model.md`).
 *
 * `total`/`open` dùng cho cả `E196` lẫn `E205`: Job phải có ít nhất 1 dòng QC, không còn dòng nào
 * chưa `COMPLETED` — một công đoạn `OUTSOURCE` mà OS-IN chưa từng `requiresIqc` (không sinh dòng
 * nào) đóng góp `(0, 0)`, không tự nó chặn `E196` (đúng semantics gốc trước khi có nhánh gia công
 * ngoài — `docs/decisions/oqc-per-operation.md`, nên không cần mã lỗi riêng cho ca này nữa, khác
 * `E212` cũ). `finalCompleted`/`hasFinalAssembly` — riêng cho `E209`: đếm dòng `COMPLETED` gắn với
 * công đoạn thuộc node Cấp 0 (`itemType = 'FG'`, bước Lắp ráp, `copyFinalAssemblyRouting`); `E205`
 * không dùng hai field này.
 *
 * `total`/`finalCompleted` loại trừ dòng `disposition = SCRAP` (cùng điều kiện `notScrapped` ở
 * trên, viết lại dạng `filter` vì cần gộp với điều kiện khác) — một lô đã loại bỏ tuy khoá cứng ở
 * `status = COMPLETED` nhưng không chứng minh được gì về hàng còn lại của Job, không được tính là
 * "đã QC xong" (`docs/domains/quality-oqc.md`). `open` **không** loại trừ SCRAP — nó là điểm
 * dừng thật, không phải "còn dở dang", nếu tính vào `open` thì Job sẽ vĩnh viễn không qua được gate
 * dù đã làm bù xong. */
export async function getJobQcCoverage(
  db: Database | DbTransaction,
  productionJobId: string,
): Promise<{
  total: number;
  open: number;
  finalCompleted: number;
  hasFinalAssembly: boolean;
}> {
  const [row] = await db
    .select({
      total:
        sql<number>`count(${qualityInspections.id}) filter (where ${qualityInspections.disposition} is distinct from ${OqcDisposition.SCRAP})`.mapWith(
          Number,
        ),
      open: sql<number>`count(${qualityInspections.id}) filter (where ${qualityInspections.status} <> 'COMPLETED')`.mapWith(
        Number,
      ),
      finalCompleted:
        sql<number>`count(${qualityInspections.id}) filter (where ${productionJobBomItems.itemType} = 'FG' and ${qualityInspections.status} = 'COMPLETED' and ${qualityInspections.disposition} is distinct from ${OqcDisposition.SCRAP})`.mapWith(
          Number,
        ),
      hasFinalAssembly: sql<boolean>`bool_or(${productionJobBomItems.itemType} = 'FG')`,
    })
    .from(productionJobOperations)
    .innerJoin(
      productionJobBomItems,
      eq(
        productionJobBomItems.id,
        productionJobOperations.productionJobBomItemId,
      ),
    )
    .leftJoin(
      qualityInspections,
      eq(
        qualityInspections.productionJobOperationId,
        productionJobOperations.id,
      ),
    )
    .where(eq(productionJobOperations.productionJobId, productionJobId));

  return {
    total: row?.total ?? 0,
    open: row?.open ?? 0,
    finalCompleted: row?.finalCompleted ?? 0,
    hasFinalAssembly: row?.hasFinalAssembly ?? false,
  };
}

/** Mở khoá Job sang `WAITING_DELIVERY` khi mọi dòng QC (IQC lẫn OQC, `getJobQcCoverage` gộp chung
 * theo `qc-data-model.md`) đã xong **và** không còn công đoạn nào của Job dở
 * (`countPendingJobOperations`, `production-jobs.query.ts`) — gọi từ **mọi** nơi có thể đưa một
 * dòng `quality_inspections` về `COMPLETED`: `OqcService.confirmOqc`, `IqcService.confirmIqc`,
 * `completeIqcAfterSupplierReturn`; thiếu chỗ nào thì Job kẹt vĩnh viễn ở `WAITING_QC` (BUG-047).
 * Đóng được Job thì ghi tiếp sang module kho — tự sinh phiếu nhập TP thẳng `PENDING_RECEIPT`
 * (`createProductionReceiptForJob`, `docs/domains/inventory.md`). */
export async function closeJobIfQcCovered(
  tx: DbTransaction,
  productionJobId: string,
  userId: string,
): Promise<void> {
  const [coverage, pendingOperations] = await Promise.all([
    getJobQcCoverage(tx, productionJobId),
    countPendingJobOperations(tx, productionJobId),
  ]);

  if (coverage.total > 0 && coverage.open === 0 && pendingOperations === 0) {
    const [closedJob] = await tx
      .update(productionJobs)
      .set({ status: ProductionJobStatus.WAITING_DELIVERY })
      .where(
        and(
          eq(productionJobs.id, productionJobId),
          inArray(productionJobs.status, [
            ProductionJobStatus.IN_PROGRESS,
            ProductionJobStatus.WAITING_QC,
          ]),
        ),
      )
      .returning({ id: productionJobs.id });

    // Hàm này bị gọi lại mỗi lần confirm 1 dòng QC bất kỳ và `coverage` vẫn true sau đó — chỉ
    // UPDATE trên mới khớp đúng một lần trong đời Job, nên phiếu nhập TP không bao giờ trùng.
    if (closedJob) {
      await createProductionReceiptForJob(tx, productionJobId, userId);
    }
  }
}
