import { and, eq, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  supplierReturns,
} from '../../database/schemas';

/** SL đã trả NCC theo từng vật tư của một phiếu nhập, chỉ tính phiếu trả đã `POSTED` — dùng bởi
 *  `InventoryReceiptsService.postInventoryReceipt` để bù trừ trước khi ghi bút toán `RECEIPT`
 *  (xem `docs/workflows/supplier-return.md`, mục "bù trừ tồn"). Tại thời điểm `post` phiếu nhập
 *  chạy, mọi phiếu trả liên quan chắc chắn đã `POSTED` — phiếu nhập chỉ `post` được sau khi mọi
 *  IQC liên quan `COMPLETED`, và một IQC `WAITING_RETURN` chỉ `COMPLETED` sau khi phiếu trả của
 *  nó đã `POSTED` (`SupplierReturnsService.postSupplierReturn` →
 *  `completeIqcAfterSupplierReturn`). Plain function, không qua DI — cùng khuôn
 *  `purchase-orders.query.ts`. */
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

  return new Map(rows.map((row) => [row.itemId, row.returned]));
}
