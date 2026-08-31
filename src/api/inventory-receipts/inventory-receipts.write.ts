import { and, eq } from 'drizzle-orm';

import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import type { DbTransaction } from '../../database/database.type';
import { vnToday } from '../../database/vn-date.util';
import {
  InventoryDocumentStatus,
  inventoryReceiptItems,
  inventoryReceipts,
  InventoryReceiptType,
  items,
  productionJobs,
} from '../../database/schemas';

export async function generateReceiptCode(
  tx: DbTransaction,
  receiptDate: Date,
): Promise<string> {
  const year = receiptDate.getFullYear();
  const sequence = await generateDocumentSequence(
    tx,
    DocumentType.INVENTORY_RECEIPT,
    year,
  );

  return `PNK-${year}-${String(sequence).padStart(5, '0')}`;
}

async function hasProductionReceiptForJob(
  tx: DbTransaction,
  productionJobId: string,
): Promise<boolean> {
  const [existing] = await tx
    .select({ id: inventoryReceipts.id })
    .from(inventoryReceipts)
    .where(
      and(
        eq(inventoryReceipts.productionJobId, productionJobId),
        eq(inventoryReceipts.receiptType, InventoryReceiptType.PRODUCTION),
      ),
    )
    .limit(1);

  return !!existing;
}

/** Tự sinh 1 phiếu nhập kho TP thẳng ở `PENDING_RECEIPT` (đã "confirm", sẵn sàng `post`) + dòng
 *  của nó (SL = `production_jobs.quantity`, `unitId` = đơn vị gốc của item), trong CÙNG
 *  transaction vừa đẩy Job sang `WAITING_DELIVERY` (`closeJobIfQcCovered`, `oqc.query.ts`). Không
 *  qua `DRAFT` rồi gọi `confirmInventoryReceipt` — OQC vừa đóng coverage chính là gate chất lượng
 *  của phiếu này (`ensureProductionReceiptOqcCleared` sẽ luôn pass), và phiếu PRODUCTION không
 *  bao giờ `requiresIqc` (IQC chỉ dành hàng nhập từ NCC/gia công ngoài), nên không có bước "confirm"
 *  nào thật sự khác `PENDING_RECEIPT` để chờ — `confirmedBy`/`confirmedAt` gán luôn `userId`
 *  (người vừa confirm OQC). Plain function nhận `tx`, không qua DI vì `OqcModule`/`IqcModule` cố ý
 *  không import `InventoryReceiptsModule` — cùng lý do `completeIqcAfterSupplierReturn`
 *  (`iqc.write.ts`). Bỏ qua im lặng khi Job đã có phiếu — `docs/domains/inventory.md`. */
export async function createProductionReceiptForJob(
  tx: DbTransaction,
  productionJobId: string,
  userId: string,
): Promise<void> {
  const [job] = await tx
    .select({
      itemId: productionJobs.itemId,
      quantity: productionJobs.quantity,
      productionOrderId: productionJobs.productionOrderId,
      unitId: items.unitId,
    })
    .from(productionJobs)
    .innerJoin(items, eq(items.id, productionJobs.itemId))
    .where(eq(productionJobs.id, productionJobId));

  if (!job) {
    return;
  }

  if (await hasProductionReceiptForJob(tx, productionJobId)) {
    return;
  }

  const receiptDate = vnToday();
  const code = await generateReceiptCode(tx, receiptDate);
  const confirmedAt = new Date();

  const [inventoryReceipt] = await tx
    .insert(inventoryReceipts)
    .values({
      code,
      receiptType: InventoryReceiptType.PRODUCTION,
      receiptDate,
      productionJobId,
      productionOrderId: job.productionOrderId,
      status: InventoryDocumentStatus.PENDING_RECEIPT,
      createdBy: userId,
      confirmedBy: userId,
      confirmedAt,
    })
    .returning({ id: inventoryReceipts.id });

  await tx.insert(inventoryReceiptItems).values({
    receiptId: inventoryReceipt.id,
    itemId: job.itemId,
    quantity: job.quantity,
    unitId: job.unitId,
  });
}
