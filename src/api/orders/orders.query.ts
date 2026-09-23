import { sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import { inventoryTransactions } from '../../database/schemas';

/** SL đã xuất/giao thật theo từng dòng đơn — cùng logic `InventoryService.deliveredSubquery`
 * (`src/api/inventory/inventory.service.ts`), copy có chủ ý vì khác domain tiêu thụ (cùng quy ước
 * `purchase-orders.query.ts` copy `receivedQuantitySubquery`). Không lọc `type`/trạng thái phiếu —
 * huỷ phiếu tự triệt tiêu qua bút toán đảo dấu cùng `orderItemId`. Nhận `tx` khi cần đọc trong cùng
 * transaction vừa ghi bút toán (`OutboundOrdersService.deliverOutboundOrder`), `db` cho mọi nơi
 * khác. */
export function issuedQuantityByOrderItemIdSubquery(
  db: Database | DbTransaction,
) {
  return db
    .select({
      orderItemId: inventoryTransactions.orderItemId,
      issuedQty: sql<number>`sum(-${inventoryTransactions.quantity})`
        .mapWith(Number)
        .as('issued_qty'),
    })
    .from(inventoryTransactions)
    .where(sql`${inventoryTransactions.orderItemId} IS NOT NULL`)
    .groupBy(inventoryTransactions.orderItemId)
    .as('issued_qty_by_order_item');
}

