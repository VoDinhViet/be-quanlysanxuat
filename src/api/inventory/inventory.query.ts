import { and, eq, inArray, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../database/database.type';
import {
  inventoryBalances,
  inventoryTransactions,
  items,
  orderItems,
  orders,
  OrderItemStatus,
  OrderStatus,
} from '../../database/schemas';
import { StockStatus } from './inventory.constant';

/** Tồn theo item — gộp `inventory_balances` (tồn hiện tại) trừ khi `asOfDate` được truyền, khi đó
 * cộng lại từ `inventory_transactions` với `transactionDate <= asOfDate`. Không tự lọc theo loại
 * item — nơi gọi join/lọc `items` ở tầng ngoài, subquery chỉ gộp theo `itemId`. Dùng chung giữa
 * `InventoryService`, `inventory-products`, `inventory-materials`. */
export function balanceByItemSubquery(
  db: Database,
  asOfDate?: Date,
  warehouseId?: string,
) {
  if (asOfDate) {
    return db
      .select({
        itemId: inventoryTransactions.itemId,
        onHand: sql<number>`sum(${inventoryTransactions.quantity})`
          .mapWith(Number)
          .as('on_hand'),
      })
      .from(inventoryTransactions)
      .where(
        and(
          lte(inventoryTransactions.transactionDate, asOfDate),
          warehouseId
            ? eq(inventoryTransactions.warehouseId, warehouseId)
            : undefined,
        ),
      )
      .groupBy(inventoryTransactions.itemId)
      .as('item_on_hand');
  }

  return db
    .select({
      itemId: inventoryBalances.itemId,
      onHand: sql<number>`sum(${inventoryBalances.quantity})`
        .mapWith(Number)
        .as('on_hand'),
    })
    .from(inventoryBalances)
    .where(
      warehouseId ? eq(inventoryBalances.warehouseId, warehouseId) : undefined,
    )
    .groupBy(inventoryBalances.itemId)
    .as('item_balance');
}

/** Mỗi dòng đơn hàng đã thực xuất kho bao nhiêu — cộng `-quantity` trên mọi bút toán có
 * `orderItemId`. Một phiếu xuất `post` ghi dòng âm; huỷ phiếu (`cancel`) ghi thêm dòng đảo dấu
 * dương cùng `orderItemId` nên tự triệt tiêu, không cần lọc theo trạng thái phiếu. */
export function deliveredQuantityByOrderItemSubquery(db: Database) {
  return db
    .select({
      orderItemId: inventoryTransactions.orderItemId,
      deliveredQty: sql<number>`sum(-${inventoryTransactions.quantity})`
        .mapWith(Number)
        .as('delivered_qty'),
    })
    .from(inventoryTransactions)
    .where(sql`${inventoryTransactions.orderItemId} IS NOT NULL`)
    .groupBy(inventoryTransactions.orderItemId)
    .as('delivered');
}

/** Với mỗi item, phần nhu cầu đơn đang mở chưa giao. "Mở" nghĩa là đã qua cổng duyệt
 * (`AWAITING_PRODUCTION`/`IN_PROGRESS`) — đơn `DRAFT`/`PENDING_CONFIRMATION` chưa được Giám đốc
 * duyệt nên chưa tính vào đây. `excludeOrderId` loại một đơn khỏi nhu cầu khi tính Khả dụng cho
 * chính đơn đó — đơn này đã tự tính vào nhu cầu nên không loại trừ sẽ bị trừ hai lần; chỉ
 * `ProductionOrdersService` truyền tham số này. Tên hàm cố ý không dùng chữ "reserved" — khác khái
 * niệm "đã có chứng từ giữ" ở `inventory-products.service.ts` (`docs/domains/inventory.md`). */
export function openOrderDemandByItemSubquery(
  db: Database,
  excludeOrderId?: string,
) {
  const delivered = deliveredQuantityByOrderItemSubquery(db);

  return db
    .select({
      itemId: orderItems.itemId,
      demand:
        sql<number>`sum(greatest(${orderItems.quantity} - coalesce(${delivered.deliveredQty}, 0), 0))`
          .mapWith(Number)
          .as('open_order_demand'),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(delivered, eq(delivered.orderItemId, orderItems.id))
    .where(
      and(
        eq(orderItems.status, OrderItemStatus.NORMAL),
        isNull(orders.deletedAt),
        inArray(orders.status, [
          OrderStatus.AWAITING_PRODUCTION,
          OrderStatus.IN_PROGRESS,
        ]),
        excludeOrderId ? ne(orders.id, excludeOrderId) : undefined,
      ),
    )
    .groupBy(orderItems.itemId)
    .as('open_order_demand');
}

/** Trả boolean SQL trực tiếp (không qua CASE) — chỉ phục vụ lọc `WHERE`, không cần hiển thị. */
export function stockStatusCondition(
  availableSql: () => SQL<number>,
  status: StockStatus,
) {
  switch (status) {
    case StockStatus.SHORTAGE:
      return sql`(${availableSql()}) < 0`;
    case StockStatus.WARNING:
      return sql`(${availableSql()}) >= 0 and (${availableSql()}) < ${items.minStock}`;
    case StockStatus.NORMAL:
      return sql`(${availableSql()}) >= ${items.minStock}`;
  }
}
