import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import type { Database } from '../../database/database.type';
import {
  PurchaseOrderStatus,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
} from '../../database/schemas';

/** Giá + ngày đặt mua gần nhất cho mỗi cặp (vật tư, NCC) trong `itemIds`/`supplierIds` — chỉ đơn
 * mua đã `ORDERED` và có `unitPrice`, `DISTINCT ON` lấy đúng dòng mới nhất/cặp. Dùng để hiện "Giá
 * gần nhất"/"Ngày mua gần nhất" khi khai báo NCC cho một RFQ (`docs/domains/purchasing.md`). */
export function lastPurchaseQuery(
  db: Database,
  itemIds: string[],
  supplierIds: string[],
) {
  return db
    .selectDistinctOn(
      [purchaseRequestItems.itemId, purchaseOrders.supplierId],
      {
        itemId: purchaseRequestItems.itemId,
        supplierId: purchaseOrders.supplierId,
        unitPrice: purchaseOrderItems.unitPrice,
        orderDate: purchaseOrders.orderDate,
      },
    )
    .from(purchaseOrderItems)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId),
    )
    .innerJoin(
      purchaseRequestItems,
      eq(purchaseRequestItems.id, purchaseOrderItems.purchaseRequestItemId),
    )
    .where(
      and(
        eq(purchaseOrders.status, PurchaseOrderStatus.ORDERED),
        isNotNull(purchaseOrderItems.unitPrice),
        inArray(purchaseRequestItems.itemId, itemIds),
        inArray(purchaseOrders.supplierId, supplierIds),
      ),
    )
    .orderBy(
      purchaseRequestItems.itemId,
      purchaseOrders.supplierId,
      desc(purchaseOrders.orderDate),
    );
}
