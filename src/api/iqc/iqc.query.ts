import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  inventoryReceipts,
  IqcStatus,
  QcKind,
  qualityInspections,
} from '../../database/schemas';

/** `true` nếu còn ≥1 phiếu IQC chưa `COMPLETED` (chưa kiểm/FAIL chưa xử lý/đang chờ trả NCC) của
 * bất kỳ item nào trong danh sách, cùng kho — dùng bởi
 * `InventoryIssuesService.postInventoryIssue` để chặn (`E203`) xuất vật tư sản xuất chưa qua IQC.
 * Suy kho qua `inventoryReceipt.warehouseId` (IQC không có cột kho riêng) — phiếu IQC tạo tay hoặc
 * sinh từ OS-IN (không gắn `inventoryReceiptId`) không suy được kho thì bỏ qua, không chặn
 * (`docs/decisions/qc-gates-on-stock-moves.md`). Plain function, không qua DI. */
export async function hasPendingIqcForItems(
  db: Database | DbTransaction,
  params: { itemIds: string[]; warehouseId: string },
): Promise<boolean> {
  if (!params.itemIds.length) {
    return false;
  }

  const [row] = await db
    .select({ one: sql`1` })
    .from(qualityInspections)
    .innerJoin(
      inventoryReceipts,
      eq(inventoryReceipts.id, qualityInspections.inventoryReceiptId),
    )
    .where(
      and(
        eq(qualityInspections.kind, QcKind.INCOMING),
        inArray(qualityInspections.itemId, params.itemIds),
        eq(inventoryReceipts.warehouseId, params.warehouseId),
        ne(qualityInspections.status, IqcStatus.COMPLETED),
      ),
    )
    .limit(1);

  return !!row;
}
