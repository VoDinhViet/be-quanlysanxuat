import { eq, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../database/database.type';
import {
  inventoryBalances,
  productionJobMaterials,
  productionJobs,
} from '../../database/schemas';

/** Tồn theo item, gộp mọi kho — bản rút gọn của `InventoryService`'s balance subquery, không có
 * nhánh `asOfDate`/`warehouseId` vì hai nơi gọi hàm này luôn đọc tồn hiện tại, mọi kho. */
export function itemOnHandSubquery(db: Database) {
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
export function jobMaterialDemandSubquery(
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
      itemId: productionJobMaterials.itemId,
      bomDemand: sql<number>`sum(${productionJobMaterials.requiredQty})`
        .mapWith(Number)
        .as('bom_demand'),
    })
    .from(productionJobMaterials)
    .innerJoin(
      productionJobs,
      eq(productionJobs.id, productionJobMaterials.productionJobId),
    )
    .where(where)
    .groupBy(productionJobMaterials.itemId)
    .as('job_material_demand');
}

/** Nhu cầu vật tư group theo `(productionJobId, itemId)` — dùng cho sổ cái mua hàng, nơi mỗi dòng
 * thuộc một đề xuất khác nhau nên không có một scope cố định như `jobMaterialDemandSubquery`. Kết
 * hợp với `jobMaterialDemandByOrderSubquery` để giữ đúng thứ tự ưu tiên Job > LSX (xem nơi gọi). */
export function jobMaterialDemandByJobSubquery(db: Database) {
  return db
    .select({
      productionJobId: productionJobMaterials.productionJobId,
      itemId: productionJobMaterials.itemId,
      bomDemand: sql<number>`sum(${productionJobMaterials.requiredQty})`
        .mapWith(Number)
        .as('bom_demand'),
    })
    .from(productionJobMaterials)
    .groupBy(
      productionJobMaterials.productionJobId,
      productionJobMaterials.itemId,
    )
    .as('job_material_demand_by_job');
}

/** Nhu cầu vật tư group theo `(productionOrderId, itemId)`, gộp mọi Job của LSX — sibling của
 * `jobMaterialDemandByJobSubquery`, dùng khi dòng sổ cái chỉ gắn LSX, không gắn Job cụ thể. */
export function jobMaterialDemandByOrderSubquery(db: Database) {
  return db
    .select({
      productionOrderId: productionJobs.productionOrderId,
      itemId: productionJobMaterials.itemId,
      bomDemand: sql<number>`sum(${productionJobMaterials.requiredQty})`
        .mapWith(Number)
        .as('bom_demand'),
    })
    .from(productionJobMaterials)
    .innerJoin(
      productionJobs,
      eq(productionJobs.id, productionJobMaterials.productionJobId),
    )
    .groupBy(productionJobs.productionOrderId, productionJobMaterials.itemId)
    .as('job_material_demand_by_order');
}

/** 4 cột số spread vào `.select()` — `available` cố ý có thể âm (nhu cầu vượt tồn thực tế);
 * `fromStock` không lưu ở đâu, luôn tính lại lúc đọc. */
export function itemStockColumns(
  balance: ReturnType<typeof itemOnHandSubquery>,
  demand: ReturnType<typeof jobMaterialDemandSubquery>,
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

/** Biến thể của `itemStockColumns` cho sổ cái mua hàng — mỗi dòng thuộc một đề xuất khác nhau nên
 * không có một scope cố định để truyền vào `jobMaterialDemandSubquery`; `bomDemand` là coalesce
 * của hai subquery theo scope, ưu tiên Job (khớp thứ tự ưu tiên của `jobMaterialDemandSubquery`). */
export function itemStockColumnsByScope(
  balance: ReturnType<typeof itemOnHandSubquery>,
  jobDemand: ReturnType<typeof jobMaterialDemandByJobSubquery>,
  orderDemand: ReturnType<typeof jobMaterialDemandByOrderSubquery>,
) {
  const onHandSql = sql<number>`coalesce(${balance.onHand}, 0)`;
  const bomDemandSql = sql<number>`coalesce(${jobDemand.bomDemand}, ${orderDemand.bomDemand}, 0)`;

  return {
    onHand: onHandSql.mapWith(Number),
    bomDemand: bomDemandSql.mapWith(Number),
    available: sql<number>`(${onHandSql}) - (${bomDemandSql})`.mapWith(Number),
    fromStock: sql<number>`least(${onHandSql}, ${bomDemandSql})`.mapWith(
      Number,
    ),
  };
}
