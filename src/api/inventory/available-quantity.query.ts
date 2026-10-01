import { eq, inArray, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import { items } from '../../database/schemas';
import {
  remainingBomDemandByItemSubquery,
  requisitionHeldQuantityByItemSubquery,
} from '../inventory-requisitions/inventory-requisitions.query';
import { balanceByItemSubquery } from './inventory.query';

/** Biểu thức SQL TKD = TTT − giữ chỗ − nhu cầu BOM còn lại (đã trừ phần giữ chỗ gắn Job để không
 * cộng trùng). Dùng chung giữa danh sách tồn kho và `availableQuantityByItemSubquery`. */
export function stockSqlFragments(
  onHandByItem: ReturnType<typeof balanceByItemSubquery>,
  heldByItem: ReturnType<typeof requisitionHeldQuantityByItemSubquery>,
  remainingDemandByItem: ReturnType<typeof remainingBomDemandByItemSubquery>,
) {
  const onHandSql = () => sql<number>`coalesce(${onHandByItem.onHand}, 0)`;
  const reservedSql = () =>
    sql<number>`coalesce(${heldByItem.heldQuantity}, 0)`;
  const heldForJobsSql = () =>
    sql<number>`coalesce(${heldByItem.heldForJobsQuantity}, 0)`;
  const bomDemandSql = () =>
    sql<number>`greatest(coalesce(${remainingDemandByItem.remainingDemand}, 0) - (${heldForJobsSql()}), 0)`;
  const availableSql = () =>
    sql<number>`(${onHandSql()}) - (${reservedSql()}) - (${bomDemandSql()})`;

  return { onHandSql, reservedSql, bomDemandSql, availableSql };
}

/** Tồn khả dụng theo `itemId` — cùng công thức cột "Khả dụng" của màn Tồn kho vật tư, và là nguồn
 * duy nhất của số "khả dụng" người dùng thấy (chi tiết đề xuất mua, phiếu nhập, phiếu lãnh) cũng
 * như của phần thiếu khi sinh đề xuất mua. Có thể âm. Mọi item đều có một dòng, nên `innerJoin` vào
 * `items.id` ở nơi hiển thị là đủ (không cần `coalesce`). `excludeJobId` bỏ nhu cầu của Job đó: lúc
 * `startJob` nhu cầu của chính nó đã nằm trong snapshot, không loại thì bị trừ hai lần. */
export function availableQuantityByItemSubquery(
  db: Database | DbTransaction,
  excludeJobId?: string,
) {
  const onHandByItem = balanceByItemSubquery(db);
  const heldByItem = requisitionHeldQuantityByItemSubquery(db);
  const remainingDemandByItem = remainingBomDemandByItemSubquery(
    db,
    excludeJobId,
  );
  const { availableSql } = stockSqlFragments(
    onHandByItem,
    heldByItem,
    remainingDemandByItem,
  );

  return db
    .select({
      itemId: items.id,
      availableQuantity: availableSql()
        .mapWith(Number)
        .as('available_quantity'),
    })
    .from(items)
    .leftJoin(onHandByItem, eq(onHandByItem.itemId, items.id))
    .leftJoin(heldByItem, eq(heldByItem.itemId, items.id))
    .leftJoin(remainingDemandByItem, eq(remainingDemandByItem.itemId, items.id))
    .as('available_quantity_by_item');
}

/** Bản `Map` của tồn khả dụng, theo danh sách `itemIds` — dùng khi không có SELECT hiển thị để
 * `innerJoin` (ví dụ tính phần thiếu lúc `startJob`, chạy được trong transaction). */
export async function getAvailableQuantities(
  db: Database | DbTransaction,
  params: { itemIds: string[]; excludeJobId?: string },
): Promise<Map<string, number>> {
  if (!params.itemIds.length) {
    return new Map();
  }

  const available = availableQuantityByItemSubquery(db, params.excludeJobId);
  const rows = await db
    .select()
    .from(available)
    .where(inArray(available.itemId, params.itemIds));

  return new Map(rows.map((row) => [row.itemId, row.availableQuantity]));
}
