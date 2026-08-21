import { sql } from 'drizzle-orm';

import type { DbTransaction } from '../../database/database.type';
import { documentSequences } from '../../database/schemas';

export enum DocumentType {
  ITEM_RM = 'ITEM_RM',
  ITEM_FG_WIP = 'ITEM_FG_WIP',
  PURCHASE_REQUEST = 'PURCHASE_REQUEST',
  OQC = 'OQC',
  IQC = 'IQC',
  INVENTORY_RECEIPT = 'INVENTORY_RECEIPT',
  INVENTORY_ISSUE = 'INVENTORY_ISSUE',
  PURCHASE_QUOTATION = 'PURCHASE_QUOTATION',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  WAREHOUSE = 'WAREHOUSE',
  OUTSOURCING_ORDER = 'OUTSOURCING_ORDER',
  OUTSOURCING_RECEIPT = 'OUTSOURCING_RECEIPT',
}

/**
 * Cấp số tiếp theo cho một `(documentType, year)` — 1 câu `INSERT ... ON CONFLICT DO UPDATE ...
 * RETURNING`, atomic thật (không TOCTOU như `MAX(...)`, không mất số khi rollback như `SEQUENCE`).
 * BẮT BUỘC gọi trong transaction đang mở của chính lượt tạo chứng từ — dòng đếm bị khoá tới khi
 * transaction đó kết thúc, nên 2 request cùng loại/cùng năm đợi nhau thay vì đụng nhau.
 */
export async function generateDocumentSequence(
  tx: DbTransaction,
  documentType: DocumentType,
  year = 0,
): Promise<number> {
  const [row] = await tx
    .insert(documentSequences)
    .values({ documentType, year, currentValue: 1 })
    .onConflictDoUpdate({
      target: [documentSequences.documentType, documentSequences.year],
      set: { currentValue: sql`${documentSequences.currentValue} + 1` },
    })
    .returning({ currentValue: documentSequences.currentValue });

  return row.currentValue;
}

/**
 * Cấp nguyên cụm `quantity` số liên tiếp trong 1 câu lệnh — dùng cho `IqcService.generateIqcCodes`
 * (N phiếu/lượt xác nhận phiếu nhập hoặc OS-IN). Cùng ràng buộc transaction như
 * `generateDocumentSequence`.
 */
export async function generateDocumentSequences(
  tx: DbTransaction,
  documentType: DocumentType,
  year: number,
  quantity: number,
): Promise<number[]> {
  const [row] = await tx
    .insert(documentSequences)
    .values({ documentType, year, currentValue: quantity })
    .onConflictDoUpdate({
      target: [documentSequences.documentType, documentSequences.year],
      set: {
        currentValue: sql`${documentSequences.currentValue} + ${quantity}`,
      },
    })
    .returning({ currentValue: documentSequences.currentValue });

  const start = row.currentValue - quantity + 1;
  return Array.from({ length: quantity }, (_, index) => start + index);
}
