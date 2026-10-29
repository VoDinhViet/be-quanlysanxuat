import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { vnZone } from '../../common/utils/time';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  OperationType,
  OqcDisposition,
  productionJobBomItems,
  ProductionJobBomItemType,
  ProductionJobLogAction,
  productionJobLogs,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  QualityInspectionStatus,
  QualityInspectionType,
  qualityInspections,
} from '../../database/schemas';
import { createProductionReceiptForJob } from '../inventory-receipts/inventory-receipts.write';
import { countPendingJobOperations } from '../production-jobs/production-jobs.query';

/** Dòng `disposition = SCRAP` không tính vào SL đã xin QC của một công đoạn — hàng đã loại bỏ hẳn,
 * giải phóng lại quota lô để xưởng làm bù (`docs/CODEMAPS/quality.md`). Chỉ cần lọc trên
 * `disposition` vì nó khác `null` chỉ khi `decision = FAIL`
 * (`chk_quality_inspections_disposition_requires_fail`), và case row mirror attempt mới nhất nên
 * không cần join sang attempt. */
const notScrapped = or(
  isNull(qualityInspections.disposition),
  ne(qualityInspections.disposition, OqcDisposition.SCRAP),
);

/** OQC lại của NCR (`ncrId` khác `null`) kiểm lại phần NG mà lô sàng lọc gốc đã tính trong quota
 * (hoặc hàng ngoài quota của Job, với NCR tạo tay), nên không cộng thêm vào SL đã xin QC — nếu
 * không, lô một phần sẽ làm quota bị thổi lên và `isFinalQuantityInspected` coi là đủ khi còn
 * hàng chưa kiểm. */
const notNcrReinspection = isNull(qualityInspections.ncrId);

/** Σ `quantity` mọi OQC (trừ `SCRAP` và OQC lại của NCR) của riêng một công đoạn — dùng để validate
 * `E198` khi tạo OQC mới (`OqcService.createOqcForJob`). */
export async function getInspectedQuantityByOperationId(
  db: Database | DbTransaction,
  productionJobOperationId: string,
): Promise<number> {
  const [inspectedTotal] = await db
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
        notNcrReinspection,
      ),
    );

  return inspectedTotal?.total ?? 0;
}

/** Σ `quantity` mọi OQC (trừ `SCRAP` và OQC lại của NCR) của MỌI công đoạn thuộc cùng một node BOM — dùng
 * để validate `E176`: một node có nhiều công đoạn nhưng là một part vật lý, nên trần SL kế hoạch
 * tính gộp theo node (còn trần theo từng công đoạn là `E198`). */
export async function getInspectedQuantityByBomItemId(
  db: Database | DbTransaction,
  productionJobBomItemId: string,
): Promise<number> {
  const [inspectedTotal] = await db
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
        notNcrReinspection,
      ),
    );

  return inspectedTotal?.total ?? 0;
}

/** Công đoạn cuối (`sortOrder` cao nhất, không `OUTSOURCE` — gia công ngoài chỉ QC qua IQC) của node
 * FG Cấp 0 của Job, kèm trạng thái Job và SL đã hoàn thành lũy kế của công đoạn đó. Hai `LEFT JOIN`
 * (không phải `INNER`) để phân biệt "Job không tồn tại" (`undefined`) khỏi "Job tồn tại nhưng thiếu
 * node/công đoạn hợp lệ" (các cột công đoạn `null`). `uq_production_job_bom_items_final_assembly`
 * đảm bảo tối đa 1 node Cấp 0/Job; SL hoàn thành của bước cuối là SL thành phẩm. */
export async function getJobFinalOperation(
  db: Database | DbTransaction,
  productionJobId: string,
) {
  const [finalOperation] = await db
    .select({
      jobStatus: productionJobs.status,
      operationId: productionJobOperations.id,
      completedQuantity: productionJobOperations.completedQuantity,
      bomItemId: productionJobBomItems.id,
      itemId: productionJobBomItems.itemId,
      plannedQuantity: productionJobBomItems.plannedQuantity,
    })
    .from(productionJobs)
    .leftJoin(
      productionJobBomItems,
      and(
        eq(productionJobBomItems.productionJobId, productionJobs.id),
        eq(productionJobBomItems.itemType, ProductionJobBomItemType.FG),
      ),
    )
    .leftJoin(
      productionJobOperations,
      and(
        eq(
          productionJobOperations.productionJobBomItemId,
          productionJobBomItems.id,
        ),
        ne(productionJobOperations.type, OperationType.OUTSOURCE),
      ),
    )
    .where(eq(productionJobs.id, productionJobId))
    .orderBy(desc(productionJobOperations.sortOrder))
    .limit(1);

  return finalOperation;
}

/** SL thành phẩm đã hoàn thành ở công đoạn cuối mà chưa được xin OQC (trừ lô `SCRAP`, trả SL về) —
 * trần của một lô OQC mới. Dùng chung cho `OqcService.createOqcForJob` và chi tiết Job
 * (`oqcRequestableQuantity`) để nút và bước ghi không lệch nhau. */
export async function getOqcRequestableQuantity(
  db: Database | DbTransaction,
  productionJobId: string,
): Promise<number> {
  const finalOperation = await getJobFinalOperation(db, productionJobId);
  if (!finalOperation?.operationId) {
    return 0;
  }

  const inspected = await getInspectedQuantityByOperationId(
    db,
    finalOperation.operationId,
  );

  return Math.max(0, (finalOperation.completedQuantity ?? 0) - inspected);
}

/** Σ SL đạt của các lô OQC của Job đã `COMPLETED` và không `SCRAP` — lô đạt / chấp nhận tính cả
 * `quantity`, lô sàng lọc (`SORT`) chỉ tính phần `sort_ok_qty` (phần NG chuyển sang NCR). Là SL
 * thành phẩm đủ điều kiện nhập kho / giao hàng. */
export async function getPassedOqcQuantityByJobId(
  db: Database | DbTransaction,
  productionJobId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total:
        sql<number>`coalesce(sum(coalesce(${qualityInspections.sortOkQty}, ${qualityInspections.quantity})), 0)`.mapWith(
          Number,
        ),
    })
    .from(qualityInspections)
    .where(
      and(
        eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
        eq(qualityInspections.productionJobId, productionJobId),
        eq(qualityInspections.status, QualityInspectionStatus.COMPLETED),
        notScrapped,
      ),
    );

  return row?.total ?? 0;
}

/** Thống kê dòng QC của một Job cho gate nhập kho TP (`E196`/`E209`), gate giao hàng (`E205`) và
 * `closeJobIfQcCovered`. Gộp IQC lẫn OQC qua neo chung `productionJobOperationId`: công đoạn
 * `INHOUSE` chỉ có dòng OQC, công đoạn `OUTSOURCE` chỉ có dòng IQC sinh từ OS-IN (xem
 * `IqcService.createInspectionsFromOutsourcingReceipt`), nên LEFT JOIN một cột là đủ.
 *
 * Rules:
 * - `total` và `finalCompleted` loại dòng `disposition = SCRAP` (cùng điều kiện `notScrapped`, viết
 *   dạng `filter`): lô đã loại bỏ tuy khoá ở `COMPLETED` nhưng không chứng minh gì về hàng còn lại.
 * - `open` là dòng chưa `COMPLETED`, `openIqc` là phần IQC của nó. Không cần loại SCRAP vì dòng
 *   SCRAP luôn đã `COMPLETED`.
 * - Công đoạn `OUTSOURCE` mà OS-IN không `requiresIqc` không có dòng nào, đóng góp `(0, 0)` và tự
 *   nó không chặn gate.
 * - `finalCompleted`/`hasFinalAssembly`: dòng `COMPLETED` gắn với công đoạn của node Cấp 0
 *   (`itemType = 'FG'`).
 *
 * See `docs/CODEMAPS/quality.md`. */
export async function getJobQcCoverage(
  db: Database | DbTransaction,
  productionJobId: string,
): Promise<{
  total: number;
  open: number;
  openIqc: number;
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
      openIqc:
        sql<number>`count(${qualityInspections.id}) filter (where ${qualityInspections.status} <> 'COMPLETED' and ${qualityInspections.inspectionType} = 'IQC')`.mapWith(
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
    openIqc: row?.openIqc ?? 0,
    finalCompleted: row?.finalCompleted ?? 0,
    hasFinalAssembly: row?.hasFinalAssembly ?? false,
  };
}

/** Chuyển Job sang `WAITING_DELIVERY` khi mọi dòng QC (IQC lẫn OQC, qua `getJobQcCoverage`) đã
 * xong, không còn công đoạn nào dở (`countPendingJobOperations`) **và** mọi SL thành phẩm đã hoàn
 * thành đều đã được xin OQC — OQC theo lô một phần nên "mọi dòng QC đã xong" chưa đủ: lô cuối có
 * thể chưa từng được xin.
 *
 * Gọi từ **mọi** nơi có thể đưa một dòng `quality_inspections` về `COMPLETED`: `confirmOqc`,
 * `confirmIqc`, `completeIqcAfterSupplierReturn`; thiếu chỗ nào thì Job kẹt ở `WAITING_QC`. Đóng
 * được Job thì bù luôn phiếu nhập TP còn thiếu (`createProductionReceiptForJob`,
 * `docs/CODEMAPS/inventory.md`). */
export async function closeJobIfQcCovered(
  tx: DbTransaction,
  productionJobId: string,
  userId: string,
): Promise<void> {
  const [coverage, pendingOperations, finalOperation] = await Promise.all([
    getJobQcCoverage(tx, productionJobId),
    countPendingJobOperations(tx, productionJobId),
    getJobFinalOperation(tx, productionJobId),
  ]);

  if (
    coverage.total === 0 ||
    coverage.open > 0 ||
    pendingOperations > 0 ||
    !(await isFinalQuantityInspected(tx, finalOperation))
  ) {
    return;
  }

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

  // Hàm bị gọi lại mỗi lần confirm một dòng QC và điều kiện vẫn đúng sau đó; chỉ lần UPDATE đầu
  // khớp trạng thái nên log chỉ ghi một lần.
  if (!closedJob) {
    return;
  }

  // `performedBy` NULL: `userId` ở đây là người xác nhận 1 dòng QC, không phải actor trực tiếp
  // trên Job — lý lẽ đầy đủ ở doc bảng `production_job_logs`.
  await tx.insert(productionJobLogs).values({
    productionJobId,
    action: ProductionJobLogAction.WAITING_DELIVERY,
    content: 'Đã qua toàn bộ QC — chuyển sang chờ giao hàng',
    performedBy: null,
  });

  // Job có OQC thành phẩm: phiếu nhập đã sinh theo từng lô lúc confirm OQC, chỉ bù phần còn thiếu.
  // Job không có OQC (thành phẩm gia công ngoài, chỉ IQC): phiếu theo SL của Job.
  await createProductionReceiptForJob(
    tx,
    productionJobId,
    userId,
    finalOperation?.operationId
      ? await getPassedOqcQuantityByJobId(tx, productionJobId)
      : undefined,
  );
}

/** Công đoạn cuối đã được xin OQC đủ SL hoàn thành (lô `SCRAP` không tính). Job không có công đoạn
 * OQC (thành phẩm gia công ngoài) coi như đủ — QC của nó đi qua IQC. */
async function isFinalQuantityInspected(
  tx: DbTransaction,
  finalOperation: Awaited<ReturnType<typeof getJobFinalOperation>>,
): Promise<boolean> {
  if (!finalOperation?.operationId) {
    return true;
  }

  const inspected = await getInspectedQuantityByOperationId(
    tx,
    finalOperation.operationId,
  );

  return inspected >= (finalOperation.completedQuantity ?? 0);
}

/** Mã phiếu OQC `OQC-<năm>-<số 5 chữ số>`, đánh số theo năm của ngày kiểm. */
export async function generateOqcCode(
  tx: DbTransaction,
  inspectionDate: Date,
): Promise<string> {
  const year = vnZone(inspectionDate).getFullYear();
  const sequence = await generateDocumentSequence(tx, DocumentType.OQC, year);

  return `OQC-${year}-${String(sequence).padStart(5, '0')}`;
}
