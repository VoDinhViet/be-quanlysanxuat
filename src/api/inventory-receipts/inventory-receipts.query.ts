import { asc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../../database/database.type';
import {
  inventoryReceiptItems,
  orders,
  productionOrders,
  purchaseOrderItems,
  purchaseRequestItems,
  purchaseRequests,
} from '../../database/schemas';

/** Nguồn hiển thị của một đề xuất mua hàng: số PO của khách hàng (qua LSX), không có thì lý do người
 * lập đã nhập (`note`) — không bao giờ hiện cả hai, cùng luật cột "PO liên quan / Lý do" của danh sách
 * Đề xuất mua hàng. */
export function purchaseRequestSource(request: {
  note: string | null;
  productionOrder?: { order: { buyerPoNo: string | null } | null } | null;
}): string | null {
  return request.productionOrder?.order?.buyerPoNo || request.note || null;
}

/** Nguồn (PO khách / lý do mua) của các phiếu nhập mua hàng, theo từng phiếu: đi từ dòng phiếu nhập →
 * dòng đơn mua → dòng đề xuất → đề xuất mua hàng. Một phiếu gom nhiều đề xuất thì có nhiều phần tử,
 * đã khử trùng. Phiếu không có dòng nào gắn đơn mua không xuất hiện trong kết quả. */
export async function getPurchaseSourcesByReceiptId(
  db: Database,
  receiptIds: string[],
): Promise<Map<string, string[]>> {
  if (!receiptIds.length) {
    return new Map();
  }

  const rows = await db
    .selectDistinct({
      receiptId: inventoryReceiptItems.receiptId,
      note: purchaseRequests.note,
      buyerPoNo: orders.buyerPoNo,
    })
    .from(inventoryReceiptItems)
    .innerJoin(
      purchaseOrderItems,
      eq(purchaseOrderItems.id, inventoryReceiptItems.purchaseOrderItemId),
    )
    .innerJoin(
      purchaseRequestItems,
      eq(purchaseRequestItems.id, purchaseOrderItems.purchaseRequestItemId),
    )
    .innerJoin(
      purchaseRequests,
      eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
    )
    .leftJoin(
      productionOrders,
      eq(productionOrders.id, purchaseRequests.productionOrderId),
    )
    .leftJoin(orders, eq(orders.id, productionOrders.orderId))
    .where(inArray(inventoryReceiptItems.receiptId, receiptIds))
    .orderBy(
      asc(orders.buyerPoNo),
      asc(purchaseRequests.note),
      asc(inventoryReceiptItems.receiptId),
    );

  const sourcesByReceiptId = new Map<string, string[]>();
  for (const row of rows) {
    const source = row.buyerPoNo || row.note;
    if (!source) continue;

    const sources = sourcesByReceiptId.get(row.receiptId) ?? [];
    if (!sources.includes(source)) {
      sources.push(source);
    }
    sourcesByReceiptId.set(row.receiptId, sources);
  }
  return sourcesByReceiptId;
}
