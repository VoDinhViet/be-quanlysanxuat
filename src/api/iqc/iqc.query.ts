import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  inventoryReceipts,
  QualityInspectionOriginType,
  QualityInspectionStatus,
  QualityInspectionType,
  qualityInspections,
} from '../../database/schemas';

/** `true` nếu còn ≥1 phiếu IQC chưa `COMPLETED` (chưa kiểm/FAIL chưa xử lý/đang chờ trả NCC) của
 * bất kỳ item nào trong danh sách — dùng bởi `InventoryIssuesService.postInventoryIssue` để chặn
 * (`E203`) xuất vật tư sản xuất chưa qua IQC. Join sang `inventory_receipts` (qua
 * `origin_type = INVENTORY_RECEIPT`) giới hạn gate vào đúng IQC hàng nhập kho — phiếu IQC sinh từ
 * OS-IN không vào gate này (`docs/decisions/qc-gates-on-stock-moves.md`). Plain function, không qua
 * DI. */
export async function hasPendingIqcForItems(
  db: Database | DbTransaction,
  params: { itemIds: string[] },
): Promise<boolean> {
  if (!params.itemIds.length) {
    return false;
  }

  const [row] = await db
    .select({ one: sql`1` })
    .from(qualityInspections)
    .innerJoin(
      inventoryReceipts,
      and(
        eq(
          qualityInspections.originType,
          QualityInspectionOriginType.INVENTORY_RECEIPT,
        ),
        eq(qualityInspections.originId, inventoryReceipts.id),
      ),
    )
    .where(
      and(
        eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
        inArray(qualityInspections.itemId, params.itemIds),
        ne(qualityInspections.status, QualityInspectionStatus.COMPLETED),
      ),
    )
    .limit(1);

  return !!row;
}

/** `true` chỉ khi phiếu nhập có ≥ 1 phiếu IQC và **mọi** phiếu đã `COMPLETED` — dùng chung cho gate
 * `E153` lúc `post` phiếu nhập và cho mốc `PENDING_IQC ⇄ IQC_COMPLETED` (`syncReceiptIqcStatus`). */
export async function areReceiptIqcInspectionsCompleted(
  tx: DbTransaction,
  receiptId: string,
): Promise<boolean> {
  const inspections = await tx
    .select({ status: qualityInspections.status })
    .from(qualityInspections)
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

  return (
    inspections.length > 0 &&
    inspections.every(
      (inspection) => inspection.status === QualityInspectionStatus.COMPLETED,
    )
  );
}
