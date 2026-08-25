import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  inventoryBalances,
  productionJobIssues,
  productionJobs,
} from '../../database/schemas';

/** Khoá (`FOR UPDATE`) các dòng `inventory_balances` của `(warehouseId, itemIds)`, sort tăng dần
 * theo `itemId` — thứ tự khoá cố định để hai chứng từ chồng vật tư (phiếu lãnh, DO) không deadlock.
 * Vật tư chưa có dòng `inventory_balances` thì `FOR UPDATE` không khoá được gì — vô hại: `Tồn = 0`
 * nên bước validate ngay sau đó chặn với mọi SL dương, không có gì để đọc lệch. Dùng chung cho
 * `inventory-requisitions` và `outbound-orders`. */
export async function getInventoryBalancesForUpdate(
  tx: DbTransaction,
  warehouseId: string,
  itemIds: string[],
): Promise<{ itemId: string; quantity: number }[]> {
  if (!itemIds.length) {
    return [];
  }

  return tx
    .select({
      itemId: inventoryBalances.itemId,
      quantity: inventoryBalances.quantity,
    })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.warehouseId, warehouseId),
        inArray(inventoryBalances.itemId, itemIds),
      ),
    )
    .orderBy(asc(inventoryBalances.itemId))
    .for('update');
}

/** Tồn theo item, gộp mọi kho — bản rút gọn của `InventoryService`'s balance subquery, không có
 * nhánh `asOfDate`/`warehouseId` vì hai nơi gọi hàm này luôn đọc tồn hiện tại, mọi kho. */
export function onHandQuantityByItemSubquery(db: Database) {
  return db
    .select({
      itemId: inventoryBalances.itemId,
      onHand: sql<number>`sum(${inventoryBalances.quantity})`
        .mapWith(Number)
        .as('on_hand'),
    })
    .from(inventoryBalances)
    .groupBy(inventoryBalances.itemId)
    .as('item_on_hand');
}

/** Nhu cầu vật tư của đúng Job liên quan, hoặc mọi Job của LSX nếu không có Job cụ thể — dùng
 * `sql\`false\`` thay vì join có điều kiện để câu lệnh luôn chỉ một hình dạng. Không có cả hai
 * scope → subquery rỗng, nơi gọi `coalesce` về 0. */
export function jobIssueDemandSubquery(
  db: Database,
  scope: {
    productionJobId?: string | null;
    productionOrderId?: string | null;
  },
) {
  let where: SQL = sql`false`;
  if (scope.productionJobId) {
    where = eq(productionJobs.id, scope.productionJobId);
  } else if (scope.productionOrderId) {
    where = eq(productionJobs.productionOrderId, scope.productionOrderId);
  }

  return db
    .select({
      itemId: productionJobIssues.itemId,
      bomDemand: sql<number>`sum(${productionJobIssues.requiredQty})`
        .mapWith(Number)
        .as('bom_demand'),
    })
    .from(productionJobIssues)
    .innerJoin(
      productionJobs,
      eq(productionJobs.id, productionJobIssues.productionJobId),
    )
    .where(where)
    .groupBy(productionJobIssues.itemId)
    .as('job_issue_demand');
}

/** 4 cột số spread vào `.select()` — `available` cố ý có thể âm (nhu cầu vượt tồn thực tế);
 * `fromStock` không lưu ở đâu, luôn tính lại lúc đọc. Ba field tên `available` có ba công thức
 * riêng, cố ý không hợp nhất, đừng nhầm: ở đây `onHand − bomDemand`; `GET /inventory`
 * `onHand − reserved − bomDemand` (`inventory.service.ts`); và
 * `requisitionStockColumns.availableQuantity` `onHand − remainingBomDemand`
 * (`inventory-requisitions.query.ts`). */
export function itemStockColumns(
  balance: ReturnType<typeof onHandQuantityByItemSubquery>,
  demand: ReturnType<typeof jobIssueDemandSubquery>,
) {
  const onHandSql = sql<number>`coalesce(${balance.onHand}, 0)`;
  const bomDemandSql = sql<number>`coalesce(${demand.bomDemand}, 0)`;

  return {
    onHand: onHandSql.mapWith(Number),
    bomDemand: bomDemandSql.mapWith(Number),
    available: sql<number>`(${onHandSql}) - (${bomDemandSql})`.mapWith(Number),
    fromStock: sql<number>`least(${onHandSql}, ${bomDemandSql})`.mapWith(
      Number,
    ),
  };
}
