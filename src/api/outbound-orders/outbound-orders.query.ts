import { and, eq, exists, inArray, ne, or, sql } from 'drizzle-orm';

import { unaccentILike } from '../../common/utils/search.util';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  items,
  orderItems,
  orders,
  outboundOrderItems,
  outboundOrders,
  OutboundOrderStatus,
} from '../../database/schemas';

// Ba trạng thái DO đang giữ chỗ thành phẩm — giữ ngay từ lúc tạo (`DRAFT`, BUG-087);
// `DELIVERED`/`REJECTED`/`CANCELLED` hết giữ.
const HOLDING_STATUSES = [
  OutboundOrderStatus.DRAFT,
  OutboundOrderStatus.PENDING_APPROVAL,
  OutboundOrderStatus.PENDING_DELIVERY,
];

/** Σ SL mọi dòng DO đang giữ chỗ, theo `itemId` — "Đã giữ" của thành phẩm bởi chứng từ giao hàng,
 * cùng khuôn `reservedQuantitySubquery` (`inventory-requisitions.query.ts`). `excludeOutboundOrderId`
 * (BUG-090, dùng ở trang Chi tiết/Sửa) loại chính phiếu đang xem — cùng lý do
 * `getOutboundHeldQuantities` bên dưới loại phiếu đang duyệt: nó không được trừ nhu cầu của
 * chính mình. */
export function outboundHeldQuantityByItemSubquery(
  db: Database,
  excludeOutboundOrderId?: string,
) {
  return db
    .select({
      itemId: outboundOrderItems.itemId,
      heldQuantity: sql<number>`sum(${outboundOrderItems.quantity})`
        .mapWith(Number)
        .as('outbound_held_quantity'),
    })
    .from(outboundOrderItems)
    .innerJoin(
      outboundOrders,
      eq(outboundOrders.id, outboundOrderItems.outboundOrderId),
    )
    .where(
      and(
        inArray(outboundOrders.status, HOLDING_STATUSES),
        excludeOutboundOrderId
          ? ne(outboundOrders.id, excludeOutboundOrderId)
          : undefined,
      ),
    )
    .groupBy(outboundOrderItems.itemId)
    .as('outbound_held_by_item');
}

/** Bản `Map` của "Đã giữ" FG — dùng để validate (`send`/`approve`), sibling của
 * `getReservedQuantities` (`inventory-requisitions.query.ts`). `excludeOutboundOrderId` loại chính
 * phiếu đang duyệt — nó tự nằm trong "Đã giữ" của chính nó lúc `PENDING_APPROVAL`, không được trừ
 * nhu cầu của mình hai lần. */
export async function getOutboundHeldQuantities(
  db: Database | DbTransaction,
  params: { itemIds: string[]; excludeOutboundOrderId?: string },
): Promise<Map<string, number>> {
  if (!params.itemIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      itemId: outboundOrderItems.itemId,
      heldQuantity: sql<number>`sum(${outboundOrderItems.quantity})`.mapWith(
        Number,
      ),
    })
    .from(outboundOrderItems)
    .innerJoin(
      outboundOrders,
      eq(outboundOrders.id, outboundOrderItems.outboundOrderId),
    )
    .where(
      and(
        inArray(outboundOrders.status, HOLDING_STATUSES),
        inArray(outboundOrderItems.itemId, params.itemIds),
        params.excludeOutboundOrderId
          ? ne(outboundOrders.id, params.excludeOutboundOrderId)
          : undefined,
      ),
    )
    .groupBy(outboundOrderItems.itemId);

  return new Map(rows.map((row) => [row.itemId, row.heldQuantity]));
}

/** Σ SL + danh sách mã đơn hàng (SO) và số PO khách nguồn của từng phiếu, cho list — mọi dòng, không lọc trạng thái
 * (khác `outboundHeldQuantityByItemSubquery` chỉ tính phiếu đang giữ chỗ). `orderCodes` là mảng vì
 * 1 phiếu gộp được nhiều dòng PO khác đơn (`outbound_order_items.orderItemId` không unique). */
export function outboundOrderSummarySubquery(db: Database) {
  return db
    .select({
      outboundOrderId: outboundOrderItems.outboundOrderId,
      totalQuantity: sql<number>`sum(${outboundOrderItems.quantity})`
        .mapWith(Number)
        .as('total_quantity'),
      orderCodes: sql<string[]>`array_agg(distinct ${orders.code})`.as(
        'order_codes',
      ),
      // Số PO của khách (`orders.buyerPoNo`) — đơn chưa nhập PO thì không có phần tử.
      buyerPoNos: sql<
        string[]
      >`array_agg(distinct ${orders.buyerPoNo}) filter (where ${orders.buyerPoNo} is not null)`.as(
        'buyer_po_nos',
      ),
    })
    .from(outboundOrderItems)
    .innerJoin(orderItems, eq(orderItems.id, outboundOrderItems.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .groupBy(outboundOrderItems.outboundOrderId)
    .as('outbound_order_summary');
}

/** PO của khách hoặc mã đơn hàng (SO) khớp `poNo` — dùng chung cho bộ lọc danh sách DO và bộ chọn
 * dòng đơn hàng chưa giao, để hai nơi cùng một luật khớp. */
export function orderPoNoMatch(poNo: string) {
  return or(
    unaccentILike(orders.buyerPoNo, `%${poNo}%`),
    unaccentILike(orders.code, `%${poNo}%`),
  );
}

/** Điều kiện `EXISTS` cho bộ lọc danh sách DO theo dòng: PO của khách / mã SO (`poNo`), mã hoặc tên
 * thành phẩm (`itemCode`/`itemName`) — cả ba phải khớp trên CÙNG một dòng. Lọc ở cấp phiếu bằng
 * `EXISTS` (không `JOIN`) nên không nhân bản phiếu và `count` vẫn đúng. Không có tiêu chí nào thì
 * trả `undefined` để bỏ vào `and(...)` như các điều kiện tuỳ chọn khác. */
export function outboundOrderLineMatchExists(
  db: Database,
  filter: { poNo?: string; itemCode?: string; itemName?: string },
) {
  if (!filter.poNo && !filter.itemCode && !filter.itemName) {
    return undefined;
  }

  return exists(
    db
      .select({ one: sql`1` })
      .from(outboundOrderItems)
      .innerJoin(orderItems, eq(orderItems.id, outboundOrderItems.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(items, eq(items.id, outboundOrderItems.itemId))
      .where(
        and(
          eq(outboundOrderItems.outboundOrderId, outboundOrders.id),
          filter.poNo ? orderPoNoMatch(filter.poNo) : undefined,
          filter.itemCode
            ? unaccentILike(items.code, `%${filter.itemCode}%`)
            : undefined,
          filter.itemName
            ? unaccentILike(items.name, `%${filter.itemName}%`)
            : undefined,
        ),
      ),
  );
}
