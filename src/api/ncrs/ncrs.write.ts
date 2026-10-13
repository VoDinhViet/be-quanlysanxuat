import { and, eq } from 'drizzle-orm';

import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import type { DbTransaction } from '../../database/database.type';
import {
  ncrLogs,
  NcrLogAction,
  NcrOriginType,
  ncrs,
  NcrStatus,
  NcrType,
  productionJobs,
  ProductionOrderStatus,
  productionOrders,
  qualityInspections,
} from '../../database/schemas';

type CreateNcrFromOqcInput = {
  qualityInspectionId: string;
  productionJobId: string;
  ngQty: number;
  defectDescription: string | null;
  userId: string;
};

/** Sinh NCR-NB cho phần NG của một lô OQC sàng lọc — chạy trong transaction của `confirmOqc`.
 * Plain function nhận `tx`, không qua DI: `OqcModule` cố ý không import `NcrsModule` (cùng lý do
 * `createProductionReceiptForJob`). `orderId` lấy từ LSX gốc của Job để sau này tạo được LSX phụ. */
export async function createNcrFromOqc(
  tx: DbTransaction,
  input: CreateNcrFromOqcInput,
): Promise<void> {
  const [job] = await tx
    .select({
      itemId: productionJobs.itemId,
      orderId: productionOrders.orderId,
    })
    .from(productionJobs)
    .innerJoin(
      productionOrders,
      eq(productionOrders.id, productionJobs.productionOrderId),
    )
    .where(eq(productionJobs.id, input.productionJobId));

  if (!job) {
    return;
  }

  // Lô OQC lại của một NCR cũ mà vẫn có hàng NG → NCR mới nối vào NCR cũ (vòng lặp kiểm lại).
  const [inspection] = await tx
    .select({ parentNcrId: qualityInspections.ncrId })
    .from(qualityInspections)
    .where(eq(qualityInspections.id, input.qualityInspectionId));

  const code = await generateNcrCode(tx, new Date());
  const [ncr] = await tx
    .insert(ncrs)
    .values({
      code,
      type: NcrType.INTERNAL,
      originType: NcrOriginType.OQC,
      qualityInspectionId: input.qualityInspectionId,
      productionJobId: input.productionJobId,
      parentNcrId: inspection?.parentNcrId,
      itemId: job.itemId,
      orderId: job.orderId,
      ngQty: input.ngQty,
      defectDescription: input.defectDescription,
      createdBy: input.userId,
    })
    .returning({ id: ncrs.id });

  await tx.insert(ncrLogs).values({
    ncrId: ncr.id,
    action: NcrLogAction.CREATED,
    content: 'Tự sinh từ OQC sàng lọc',
    performedBy: input.userId,
  });
}

export async function generateNcrCode(
  tx: DbTransaction,
  date: Date,
): Promise<string> {
  const year = date.getFullYear();
  const sequence = await generateDocumentSequence(tx, DocumentType.NCR, year);

  return `NCR-${year}-${String(sequence).padStart(5, '0')}`;
}

/** Đóng NCR nếu nó còn ở `fromStatus`; chỉ ghi log khi thực sự đóng. */
async function closeNcr(
  tx: DbTransaction,
  ncrId: string,
  fromStatus: NcrStatus,
  content: string,
  userId: string,
): Promise<void> {
  const [closedNcr] = await tx
    .update(ncrs)
    .set({ status: NcrStatus.CLOSED, closedAt: new Date() })
    .where(and(eq(ncrs.id, ncrId), eq(ncrs.status, fromStatus)))
    .returning({ id: ncrs.id });

  if (closedNcr) {
    await tx.insert(ncrLogs).values({
      ncrId,
      action: NcrLogAction.CLOSED,
      content,
      performedBy: userId,
    });
  }
}

/** OQC lại của NCR đã xong (`COMPLETED`, đạt hay sàng lọc) → NCR chờ OQC được đóng. Hàng NG còn lại
 * (nếu có) đã được `createNcrFromOqc` nối sang NCR mới. */
export async function closeNcrAfterOqc(
  tx: DbTransaction,
  qualityInspectionId: string,
  userId: string,
): Promise<void> {
  const [inspection] = await tx
    .select({ ncrId: qualityInspections.ncrId })
    .from(qualityInspections)
    .where(eq(qualityInspections.id, qualityInspectionId));

  if (inspection?.ncrId) {
    await closeNcr(
      tx,
      inspection.ncrId,
      NcrStatus.PENDING_QC,
      'OQC lại đã xong — đóng NCR',
      userId,
    );
  }
}

/** LSX phụ của NCR hoàn thành: đóng NCR khi mọi hướng xử lý có SL (sửa chữa / làm mới) đều đã có
 * LSX phụ `COMPLETED`. */
export async function closeNcrIfProductionOrdersDone(
  tx: DbTransaction,
  ncrId: string,
  userId: string,
): Promise<void> {
  const [ncr] = await tx
    .select({ reworkQty: ncrs.reworkQty, remakeQty: ncrs.remakeQty })
    .from(ncrs)
    .where(eq(ncrs.id, ncrId));
  if (!ncr) {
    return;
  }

  const ncrProductionOrders = await tx
    .select({ status: productionOrders.status })
    .from(productionOrders)
    .where(eq(productionOrders.ncrId, ncrId));

  const requiredCount =
    (ncr.reworkQty > 0 ? 1 : 0) + (ncr.remakeQty > 0 ? 1 : 0);
  const doneCount = ncrProductionOrders.filter(
    (productionOrder) =>
      productionOrder.status === ProductionOrderStatus.COMPLETED,
  ).length;
  if (doneCount < requiredCount) {
    return;
  }

  await closeNcr(
    tx,
    ncrId,
    NcrStatus.IN_PROGRESS,
    'LSX phụ đã hoàn thành — đóng NCR',
    userId,
  );
}
