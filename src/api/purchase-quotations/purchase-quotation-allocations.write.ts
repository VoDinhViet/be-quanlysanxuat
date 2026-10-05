import { and, eq, inArray } from 'drizzle-orm';

import type { DbTransaction } from '../../database/database.type';
import {
  purchaseQuotationItemAllocations,
  purchaseQuotationItems,
} from '../../database/schemas';

/** Sổ cái tính `quotedQuantity` = Σ SL phân bổ của báo giá chưa huỷ (`quotedQuantitySubquery`), nên
 *  hạ SL phân bổ là cách "nhả" phần chưa mua về để lập báo giá mới. Plain function, không qua DI —
 *  `purchase-orders` không import ngược được service của `purchase-quotations`. */

/** Nhả SL báo giá nguồn khi PO đóng sớm: dòng PO nhận thiếu → hạ SL phân bổ về số đã nhận; dòng
 *  nhận 0 → xoá phân bổ (CHECK `quantity > 0`). Khoá theo `(quotationId, purchaseRequestItemId)` —
 *  duy nhất trong một RFQ (E128), không phụ thuộc `quotation_item_supplier_id` có thể null. */
export async function releaseAllocationsOnEarlyClose(
  tx: DbTransaction,
  quotationId: string,
  lines: { purchaseRequestItemId: string; receivedQuantity: number }[],
  reason: string,
): Promise<void> {
  const quotationItemIds = tx
    .select({ id: purchaseQuotationItems.id })
    .from(purchaseQuotationItems)
    .where(eq(purchaseQuotationItems.quotationId, quotationId));

  const notReceivedRequestItemIds: string[] = [];
  for (const line of lines) {
    if (line.receivedQuantity === 0) {
      notReceivedRequestItemIds.push(line.purchaseRequestItemId);
      continue;
    }

    await tx
      .update(purchaseQuotationItemAllocations)
      .set({
        quantity: line.receivedQuantity,
        quantityAdjustmentReason: reason,
      })
      .where(
        and(
          inArray(
            purchaseQuotationItemAllocations.quotationItemId,
            quotationItemIds,
          ),
          eq(
            purchaseQuotationItemAllocations.purchaseRequestItemId,
            line.purchaseRequestItemId,
          ),
        ),
      );
  }

  if (notReceivedRequestItemIds.length) {
    await tx
      .delete(purchaseQuotationItemAllocations)
      .where(
        and(
          inArray(
            purchaseQuotationItemAllocations.quotationItemId,
            quotationItemIds,
          ),
          inArray(
            purchaseQuotationItemAllocations.purchaseRequestItemId,
            notReceivedRequestItemIds,
          ),
        ),
      );
  }
}
