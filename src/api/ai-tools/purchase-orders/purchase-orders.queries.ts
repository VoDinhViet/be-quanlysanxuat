import { GetPurchaseOrdersReqDto } from '../../purchase-orders/dto/get-purchase-orders.req.dto';
import type { PagePurchaseOrderResDto } from '../../purchase-orders/dto/page-purchase-order.res.dto';
import { PurchaseOrdersService } from '../../purchase-orders/purchase-orders.service';
import { createRequestDto, getVietnamDate } from '../core/ai-tool.result';

/** How many open purchase orders are scanned when looking for overdue ones: the service has no
 * "overdue" filter, so lateness is computed here from `expectedDate`. */
const OPEN_PURCHASE_ORDER_SCAN_LIMIT = 100;

export type OverduePurchaseOrders = {
  orders: PagePurchaseOrderResDto[];
  openTotal: number;
  scanned: number;
};

/** Purchase orders still waiting on goods whose expected delivery date has already passed. */
export async function findOverduePurchaseOrders(
  purchaseOrdersService: PurchaseOrdersService,
): Promise<OverduePurchaseOrders> {
  const page = await purchaseOrdersService.getPurchaseOrders(
    createRequestDto(GetPurchaseOrdersReqDto, {
      limit: OPEN_PURCHASE_ORDER_SCAN_LIMIT,
      hasRemainingReceipt: true,
    }),
  );

  const today = getVietnamDate(0).getTime();
  const orders = page.data
    .filter(
      (order) => order.expectedDate && order.expectedDate.getTime() < today,
    )
    .sort((a, b) => a.expectedDate!.getTime() - b.expectedDate!.getTime());

  return {
    orders,
    openTotal: page.pagination.totalRecords,
    scanned: page.data.length,
  };
}
