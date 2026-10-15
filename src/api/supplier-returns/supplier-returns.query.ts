import { and, eq, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  supplierReturns,
} from '../../database/schemas';

/** SL đã trả NCC theo từng vật tư của một phiếu nhập, chỉ tính phiếu trả `POSTED` — dùng bởi
 *  `InventoryReceiptsService.postInventoryReceipt` để bù trừ trước khi ghi bút toán `RECEIPT`
 *  (`docs/CODEMAPS/inventory.md`). Lúc `post` phiếu nhập, mọi phiếu trả liên quan đã `POSTED`:
 *  phiếu nhập chỉ `post` được khi mọi IQC liên quan `COMPLETED`, và IQC chờ trả hàng chỉ
 *  `COMPLETED` sau khi phiếu trả `POSTED` (`completeIqcAfterSupplierReturn`). Plain function,
 *  không qua DI. */
export async function getReturnedQuantityByReceiptItemId(
  db: Database | DbTransaction,
  inventoryReceiptId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      itemId: supplierReturns.itemId,
      returned: sql<number>`sum(${supplierReturns.quantity})`
        .mapWith(Number)
        .as('returned'),
    })
    .from(supplierReturns)
    .where(
      and(
        eq(supplierReturns.inventoryReceiptId, inventoryReceiptId),
        eq(supplierReturns.status, InventoryDocumentStatus.POSTED),
      ),
    )
    .groupBy(supplierReturns.itemId);

  // Phiếu trả từ kho luôn có `itemId` (chỉ nhánh OS-IN mới NULL); `where` trên
  // `inventoryReceiptId` đã loại nhánh đó.
  return new Map(rows.map((row) => [row.itemId!, row.returned]));
}
