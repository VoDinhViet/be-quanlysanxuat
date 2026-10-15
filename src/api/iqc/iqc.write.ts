import { HttpStatus } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import type { DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  QualityEvidenceKind,
  qualityInspectionEvidences,
  QualityInspectionOriginType,
  QualityInspectionStatus,
  QualityInspectionType,
  qualityInspections,
  supplierReturns,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { syncReceiptIqcStatus } from '../inventory-receipts/inventory-receipts.write';
import { closeJobIfQcCovered } from '../oqc/oqc.query';

/** Hoàn tất phiếu IQC sau khi phiếu trả NCC liên kết được `post` — gọi bởi
 *  `SupplierReturnsService.postSupplierReturn`, trong CÙNG transaction với việc trừ tồn.
 *
 *  Rules:
 *  - Plain function nhận `tx`, không qua DI: `IqcModule` đã import `SupplierReturnsModule` (để
 *    `confirmIqc` gọi `createFromIqcDisposition`), chiều ngược lại qua DI sẽ tạo vòng module.
 *  - Không đi qua `confirmIqc` (guard của nó không hợp với dòng đã `IN_PROGRESS`): đây là
 *    transition riêng, chỉ từ `IN_PROGRESS` sang `COMPLETED` (`E164` nếu sai trạng thái).
 *  - Chỉ đổi `status` của case row; không phải lần kiểm mới nên không sinh
 *    `quality_inspection_results`.
 *
 *  Xem `docs/CODEMAPS/inventory.md`. */
export async function completeIqcAfterSupplierReturn(
  tx: DbTransaction,
  iqcId: string,
  userId: string,
): Promise<void> {
  const inspection = await tx.query.qualityInspections.findFirst({
    columns: {
      status: true,
      productionJobId: true,
      originType: true,
      originId: true,
    },
    where: and(
      eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
      eq(qualityInspections.id, iqcId),
    ),
  });

  if (!inspection) {
    throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
  }

  if (inspection.status !== QualityInspectionStatus.IN_PROGRESS) {
    throw new AppException(ErrorCode.E164, HttpStatus.CONFLICT);
  }

  await tx
    .update(qualityInspections)
    .set({ status: QualityInspectionStatus.COMPLETED })
    .where(eq(qualityInspections.id, iqcId));

  await syncReceiptIqcStatus(tx, inspection);

  // Cùng lý do ở `IqcService.confirmIqc` — dòng IQC neo vào công đoạn `OUTSOURCE` có thể là dòng QC
  // cuối cùng đóng Job, dù được hoàn tất qua đường phiếu trả NCC chứ không phải `confirm` trực tiếp.
  if (inspection.productionJobId) {
    await closeJobIfQcCovered(tx, inspection.productionJobId, userId);
  }
}

/** Gắn bằng chứng cho MỘT attempt vừa tạo: attempt append-only nên luôn là insert vào một
 *  `qualityInspectionResultId` chưa có dòng nào (không có "replace-all"). Dùng chung
 *  `IqcService.confirmIqc`/`OqcService.confirmOqc` — plain function nhận `tx`, không qua DI. */
export async function linkQcFiles(
  tx: DbTransaction,
  qualityInspectionResultId: string,
  kind: QualityEvidenceKind,
  fileIds: string[],
): Promise<void> {
  if (!fileIds.length) {
    return;
  }

  await tx.insert(qualityInspectionEvidences).values(
    fileIds.map((fileId) => ({
      qualityInspectionResultId,
      fileId,
      kind,
    })),
  );
}

/** Huỷ mọi phiếu IQC (và phiếu trả NCC nháp) sinh từ một phiếu nhập kho khi phiếu đó bị huỷ — gọi
 *  bởi `InventoryReceiptsService.cancelInventoryReceipt` trong CÙNG transaction. Phiếu trả NCC đã
 *  `POSTED` thì chặn (`E290`): hàng đã xuất trả NCC, không tự đảo được. IQC giữ lại ở `CANCELLED`
 *  để truy vết. Plain function nhận `tx`, không qua DI (cùng lý do
 *  `completeIqcAfterSupplierReturn`). */
export async function cancelReceiptInspections(
  tx: DbTransaction,
  receiptId: string,
): Promise<void> {
  const [postedReturn] = await tx
    .select({ id: supplierReturns.id })
    .from(supplierReturns)
    .where(
      and(
        eq(supplierReturns.inventoryReceiptId, receiptId),
        eq(supplierReturns.status, InventoryDocumentStatus.POSTED),
      ),
    )
    .limit(1);
  if (postedReturn) {
    throw new AppException(ErrorCode.E290, HttpStatus.CONFLICT);
  }

  await tx
    .update(supplierReturns)
    .set({ status: InventoryDocumentStatus.CANCELLED })
    .where(
      and(
        eq(supplierReturns.inventoryReceiptId, receiptId),
        eq(supplierReturns.status, InventoryDocumentStatus.DRAFT),
      ),
    );

  await tx
    .update(qualityInspections)
    .set({ status: QualityInspectionStatus.CANCELLED })
    .where(
      and(
        eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
        eq(
          qualityInspections.originType,
          QualityInspectionOriginType.INVENTORY_RECEIPT,
        ),
        eq(qualityInspections.originId, receiptId),
      ),
    );
}
