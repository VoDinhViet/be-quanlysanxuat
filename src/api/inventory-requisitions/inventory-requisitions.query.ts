import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  inventoryBalances,
  InventoryRequisitionStatus,
  inventoryRequisitionItems,
  inventoryRequisitions,
  productionJobIssues,
} from '../../database/schemas';

/** Σ SL lãnh mọi phiếu đang `APPROVED`, theo `(warehouseId, itemId)` — "Đã giữ", LEFT JOIN thẳng
 * vào SELECT hiển thị (popup/tab chi tiết). Dùng chung khuôn `sentQuantityByJobOperationSubquery`
 * (`outsourcing-orders.query.ts`). */
export function reservedQuantitySubquery(db: Database) {
  return db
    .select({
      warehouseId: inventoryRequisitions.warehouseId,
      itemId: inventoryRequisitionItems.itemId,
      // Alias SQL cố ý khác tên cột JS `reservedQuantity` — `inventory_balances` cũng có cột thật
      // `reserved_quantity`, trùng tên gây "ambiguous column" khi cả hai cùng LEFT JOIN một query.
      reservedQuantity: sql<number>`sum(${inventoryRequisitionItems.quantity})`
        .mapWith(Number)
        .as('requisition_held_quantity'),
    })
    .from(inventoryRequisitionItems)
    .innerJoin(
      inventoryRequisitions,
      eq(inventoryRequisitions.id, inventoryRequisitionItems.requisitionId),
    )
    .where(
      eq(inventoryRequisitions.status, InventoryRequisitionStatus.APPROVED),
    )
    .groupBy(
      inventoryRequisitions.warehouseId,
      inventoryRequisitionItems.itemId,
    )
    .as('reserved_quantity_by_warehouse_item');
}

/** Bản gộp theo `itemId` (không theo kho) của `reservedQuantitySubquery` — `GET /inventory` gộp mọi
 * kho (hoặc lọc đúng một kho qua `warehouseId`), không group được theo `(kho, vật tư)`. Field trả
 * về `heldQuantity`, cố ý khác `reservedQuantity` của hàm gốc để không đọc nhầm 2 hàm là một.
 *
 * `heldForJobsQuantity` tách riêng phần giữ có gắn `productionJobId` (`type = PRODUCTION`) — chỉ
 * phần này mới trùng với `remainingBomDemandByItemSubquery` (nguồn `production_job_issues`) nên
 * mới được trừ chéo ở `InventoryService.getInventory`; phiếu `type = OTHER` không có Job nên không
 * có nhu cầu BOM đối ứng để trùng, trộn chung vào `heldQuantity` rồi trừ chéo sẽ trừ nhầm phần
 * chưa từng bị cộng trùng. Xem `docs/domains/inventory.md`. */
export function requisitionHeldQuantityByItemSubquery(
  db: Database,
  warehouseId?: string,
) {
  return db
    .select({
      itemId: inventoryRequisitionItems.itemId,
      heldQuantity: sql<number>`sum(${inventoryRequisitionItems.quantity})`
        .mapWith(Number)
        .as('requisition_held_quantity_by_item'),
      heldForJobsQuantity:
        sql<number>`sum(${inventoryRequisitionItems.quantity}) filter (where ${inventoryRequisitions.productionJobId} is not null)`
          .mapWith(Number)
          .as('requisition_held_for_jobs_quantity_by_item'),
    })
    .from(inventoryRequisitionItems)
    .innerJoin(
      inventoryRequisitions,
      eq(inventoryRequisitions.id, inventoryRequisitionItems.requisitionId),
    )
    .where(
      and(
        eq(inventoryRequisitions.status, InventoryRequisitionStatus.APPROVED),
        warehouseId
          ? eq(inventoryRequisitions.warehouseId, warehouseId)
          : undefined,
      ),
    )
    .groupBy(inventoryRequisitionItems.itemId)
    .as('requisition_held_by_item');
}

/** Bản `Map` của "Đã giữ" — dùng để validate (`create`/`approve`), không có SELECT hiển thị nào để
 * LEFT JOIN vào. `excludeRequisitionId` loại chính phiếu đang duyệt (nó tự nằm trong "Đã giữ" của
 * chính nó lúc `APPROVED`, không được trừ nhu cầu của mình hai lần — cùng lý do `excludeOrderId` ở
 * `InventoryService.getStockLevels`). */
export async function getReservedQuantities(
  db: Database | DbTransaction,
  params: {
    warehouseId: string;
    itemIds: string[];
    excludeRequisitionId?: string;
  },
): Promise<Map<string, number>> {
  if (!params.itemIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      itemId: inventoryRequisitionItems.itemId,
      reservedQuantity:
        sql<number>`sum(${inventoryRequisitionItems.quantity})`.mapWith(Number),
    })
    .from(inventoryRequisitionItems)
    .innerJoin(
      inventoryRequisitions,
      eq(inventoryRequisitions.id, inventoryRequisitionItems.requisitionId),
    )
    .where(
      and(
        eq(inventoryRequisitions.warehouseId, params.warehouseId),
        eq(inventoryRequisitions.status, InventoryRequisitionStatus.APPROVED),
        inArray(inventoryRequisitionItems.itemId, params.itemIds),
        params.excludeRequisitionId
          ? ne(inventoryRequisitions.id, params.excludeRequisitionId)
          : undefined,
      ),
    )
    .groupBy(inventoryRequisitionItems.itemId);

  return new Map(rows.map((row) => [row.itemId, row.reservedQuantity]));
}

/** Σ SL lãnh mọi phiếu đã `ISSUED`, theo `(productionJobId, itemId)` — "Đã lãnh". LEFT JOIN thẳng
 * vào SELECT hiển thị (tab chi tiết/popup) và vào `remainingBomDemandByItemSubquery` dưới đây.
 * `GET /production-jobs/:jobId/bom` cũng import trực tiếp hàm này để hiển thị "Theo dõi đã lãnh"
 * (`docs/domains/production.md`) — plain function, không qua DI, cùng tiền lệ
 * `hasPendingIqcForItems`. */
export function issuedQuantityByJobItemSubquery(db: Database) {
  return db
    .select({
      productionJobId: inventoryRequisitions.productionJobId,
      itemId: inventoryRequisitionItems.itemId,
      issuedQuantity: sql<number>`sum(${inventoryRequisitionItems.quantity})`
        .mapWith(Number)
        .as('issued_quantity'),
    })
    .from(inventoryRequisitionItems)
    .innerJoin(
      inventoryRequisitions,
      eq(inventoryRequisitions.id, inventoryRequisitionItems.requisitionId),
    )
    .where(eq(inventoryRequisitions.status, InventoryRequisitionStatus.ISSUED))
    .groupBy(
      inventoryRequisitions.productionJobId,
      inventoryRequisitionItems.itemId,
    )
    .as('issued_quantity_by_job_item');
}

/** Bản `Map` của "Đã lãnh" cho đúng một Job — dùng để validate (`create`/`approve` khi
 * `type = PRODUCTION`), sibling của `getReservedQuantities`. */
export async function getIssuedQuantities(
  db: Database | DbTransaction,
  params: { productionJobId: string; itemIds: string[] },
): Promise<Map<string, number>> {
  if (!params.itemIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      itemId: inventoryRequisitionItems.itemId,
      issuedQuantity:
        sql<number>`sum(${inventoryRequisitionItems.quantity})`.mapWith(Number),
    })
    .from(inventoryRequisitionItems)
    .innerJoin(
      inventoryRequisitions,
      eq(inventoryRequisitions.id, inventoryRequisitionItems.requisitionId),
    )
    .where(
      and(
        eq(inventoryRequisitions.productionJobId, params.productionJobId),
        eq(inventoryRequisitions.status, InventoryRequisitionStatus.ISSUED),
        inArray(inventoryRequisitionItems.itemId, params.itemIds),
      ),
    )
    .groupBy(inventoryRequisitionItems.itemId);

  return new Map(rows.map((row) => [row.itemId, row.issuedQuantity]));
}

/** "Khả dụng" — theo `itemId`, KHÔNG scope theo kho/Job: `Tồn thực tế − Σ max(requiredQty −
 * Đã lãnh, 0)` cộng dồn mọi Job đang mở, cố ý có thể âm (chỉ báo thiếu, không chặn thao tác nào,
 * khác "Có thể lãnh"). Trừ phần **còn lại** (không phải nguyên `requiredQty`) vì Job không có trạng
 * thái kết thúc (`docs/domains/production.md`) — trừ nguyên `requiredQty` mãi mãi sẽ làm số càng
 * lúc càng âm sai dù Job đã lãnh xong. Xem `docs/domains/inventory.md`, mục "Phiếu lãnh vật tư". */
export function remainingBomDemandByItemSubquery(db: Database) {
  const issued = issuedQuantityByJobItemSubquery(db);

  return db
    .select({
      itemId: productionJobIssues.itemId,
      remainingDemand:
        sql<number>`sum(greatest(${productionJobIssues.requiredQty} - coalesce(${issued.issuedQuantity}, 0), 0))`
          .mapWith(Number)
          .as('remaining_demand'),
    })
    .from(productionJobIssues)
    .leftJoin(
      issued,
      and(
        eq(issued.productionJobId, productionJobIssues.productionJobId),
        eq(issued.itemId, productionJobIssues.itemId),
      ),
    )
    .groupBy(productionJobIssues.itemId)
    .as('remaining_bom_demand');
}

/** 4 cột số spread vào cả ba `.select()` đọc dòng vật tư (chi tiết phiếu + 2 popup) — cùng khuôn
 * `itemStockColumns` (`inventory/item-stock.query.ts`). Nơi gọi phải LEFT JOIN sẵn
 * `inventory_balances` + hai subquery theo đúng `(kho, vật tư)`; `availableQuantity` cố ý có thể
 * âm, `issuableQuantity` mới là số dùng để chặn. */
export function requisitionStockColumns(
  reserved: ReturnType<typeof reservedQuantitySubquery>,
  remainingDemand: ReturnType<typeof remainingBomDemandByItemSubquery>,
) {
  const onHandSql = sql<number>`coalesce(${inventoryBalances.quantity}, 0)`;
  const reservedSql = sql<number>`coalesce(${reserved.reservedQuantity}, 0)`;

  return {
    onHand: onHandSql.mapWith(Number),
    reservedQuantity: reservedSql.mapWith(Number),
    issuableQuantity: sql<number>`(${onHandSql}) - (${reservedSql})`.mapWith(
      Number,
    ),
    availableQuantity:
      sql<number>`(${onHandSql}) - coalesce(${remainingDemand.remainingDemand}, 0)`.mapWith(
        Number,
      ),
  };
}
