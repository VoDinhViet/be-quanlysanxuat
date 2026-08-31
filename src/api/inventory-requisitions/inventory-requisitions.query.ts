import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  inventoryBalances,
  InventoryRequisitionStatus,
  inventoryRequisitionItems,
  inventoryRequisitions,
  productionJobIssues,
} from '../../database/schemas';

// Giữ chỗ bắt đầu từ lúc duyệt — `DRAFT`/`PENDING_APPROVAL` chưa giữ, `ISSUED` thôi giữ vì đã trừ
// tồn thật (tính tiếp là trừ hai lần), `REJECTED`/`CANCELLED` nhả chỗ.
const HOLDING_STATUS = InventoryRequisitionStatus.APPROVED;

/** Σ SL lãnh mọi phiếu đang giữ chỗ (`HOLDING_STATUS`), theo `itemId` — "Đã giữ", LEFT JOIN thẳng
 * vào SELECT hiển thị (popup/tab chi tiết). Dùng chung khuôn `sentQuantityByJobOperationSubquery`
 * (`outsourcing-orders.query.ts`). */
export function reservedQuantitySubquery(db: Database) {
  return db
    .select({
      itemId: inventoryRequisitionItems.itemId,
      // Alias SQL cố ý khác tên cột JS `reservedQuantity` — `inventory_balances` cũng từng có cột
      // cùng tên, giữ khác biệt cho rõ.
      reservedQuantity: sql<number>`sum(${inventoryRequisitionItems.quantity})`
        .mapWith(Number)
        .as('requisition_held_quantity'),
    })
    .from(inventoryRequisitionItems)
    .innerJoin(
      inventoryRequisitions,
      eq(inventoryRequisitions.id, inventoryRequisitionItems.requisitionId),
    )
    .where(eq(inventoryRequisitions.status, HOLDING_STATUS))
    .groupBy(inventoryRequisitionItems.itemId)
    .as('reserved_quantity_by_item');
}

/** Bản gộp theo `itemId` của `reservedQuantitySubquery` — field trả về `heldQuantity`, cố ý khác
 * `reservedQuantity` của hàm gốc để không đọc nhầm 2 hàm là một.
 *
 * `heldForJobsQuantity` tách riêng phần giữ có gắn `productionJobId` (`type = PRODUCTION`) — chỉ
 * phần này mới trùng với `remainingBomDemandByItemSubquery` (nguồn `production_job_issues`) nên
 * mới được trừ chéo ở `InventoryService.getInventory`; phiếu `type = OTHER` không có Job nên không
 * có nhu cầu BOM đối ứng để trùng, trộn chung vào `heldQuantity` rồi trừ chéo sẽ trừ nhầm phần
 * chưa từng bị cộng trùng. Xem `docs/domains/inventory.md`. */
export function requisitionHeldQuantityByItemSubquery(db: Database) {
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
    .where(eq(inventoryRequisitions.status, HOLDING_STATUS))
    .groupBy(inventoryRequisitionItems.itemId)
    .as('requisition_held_by_item');
}

/** Bản `Map` của "Đã giữ" — dùng để validate (`create`/`update`/`approve`), không có SELECT hiển thị
 * nào để LEFT JOIN vào. */
export async function getReservedQuantities(
  db: Database | DbTransaction,
  params: {
    itemIds: string[];
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
        eq(inventoryRequisitions.status, HOLDING_STATUS),
        inArray(inventoryRequisitionItems.itemId, params.itemIds),
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

/** "Khả dụng" — theo `itemId`, KHÔNG scope theo Job: `Tồn thực tế − Σ max(requiredQty −
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
 * `inventory_balances` + hai subquery theo đúng `itemId`; `availableQuantity` cố ý có thể âm,
 * `issuableQuantity` mới là số dùng để chặn. */
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
