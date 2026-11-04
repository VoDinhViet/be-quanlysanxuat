import { and, eq, inArray, ne, notInArray, or, sql } from 'drizzle-orm';

import { unaccentILike } from '../../common/utils/search';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  departments,
  inventoryBalances,
  InventoryRequisitionStatus,
  inventoryRequisitionItems,
  inventoryRequisitions,
  InventoryRequisitionType,
  orders,
  productionJobIssues,
  productionJobs,
  ProductionJobStatus,
  productionOrders,
  users,
} from '../../database/schemas';

// Giữ chỗ bắt đầu từ lúc duyệt — `DRAFT`/`PENDING_APPROVAL` chưa giữ, `ISSUED` thôi giữ vì đã trừ
// tồn thật (tính tiếp là trừ hai lần), `REJECTED`/`CANCELLED` nhả chỗ.
const HOLDING_STATUS = InventoryRequisitionStatus.APPROVED;

/** Σ SL lãnh các phiếu đang giữ chỗ (`HOLDING_STATUS`) theo `itemId` — số "Đã giữ", để LEFT JOIN
 * thẳng vào SELECT hiển thị. */
export function reservedQuantitySubquery(db: Database) {
  return db
    .select({
      itemId: inventoryRequisitionItems.itemId,
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

/** Bản gộp theo `itemId` của `reservedQuantitySubquery`; trả `heldQuantity` (cố ý khác tên
 * `reservedQuantity` để không đọc nhầm hai hàm là một).
 *
 * Rules:
 * - `heldForJobsQuantity` chỉ tính phiếu có `productionJobId` mà Job chưa `COMPLETED`. Chỉ phần này
 *   trùng với `remainingBomDemandByItemSubquery` nên `stockSqlFragments` mới trừ chéo nó; phiếu
 *   `type = OTHER` không có nhu cầu BOM đối ứng, trừ chéo sẽ trừ nhầm.
 * - Job `COMPLETED` đã bị loại khỏi nhu cầu BOM, nên phiếu `APPROVED` còn treo của nó không được
 *   trừ chéo (sẽ làm tụt nhu cầu của Job khác); phiếu đó vẫn nằm trong `heldQuantity` tới khi
 *   lãnh hoặc huỷ.
 *
 * See `docs/CODEMAPS/inventory.md`. */
export function requisitionHeldQuantityByItemSubquery(db: Database) {
  return db
    .select({
      itemId: inventoryRequisitionItems.itemId,
      heldQuantity: sql<number>`sum(${inventoryRequisitionItems.quantity})`
        .mapWith(Number)
        .as('requisition_held_quantity_by_item'),
      heldForJobsQuantity:
        sql<number>`sum(${inventoryRequisitionItems.quantity}) filter (where ${inventoryRequisitions.productionJobId} is not null and ${productionJobs.status} is distinct from ${ProductionJobStatus.COMPLETED})`
          .mapWith(Number)
          .as('requisition_held_for_jobs_quantity_by_item'),
    })
    .from(inventoryRequisitionItems)
    .innerJoin(
      inventoryRequisitions,
      eq(inventoryRequisitions.id, inventoryRequisitionItems.requisitionId),
    )
    .leftJoin(
      productionJobs,
      eq(productionJobs.id, inventoryRequisitions.productionJobId),
    )
    .where(eq(inventoryRequisitions.status, HOLDING_STATUS))
    .groupBy(inventoryRequisitionItems.itemId)
    .as('requisition_held_by_item');
}

/** Bản `Map` của "Đã giữ" cho validate (`create`/`update`/`approve`), nơi không có SELECT hiển thị
 * để LEFT JOIN. */
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

/**
 * Các phiếu lãnh đang giữ chỗ một vật tư, mỗi phiếu một dòng — chi tiết của số "Đã giữ".
 *
 * Rules:
 * - Chỉ phiếu `HOLDING_STATUS` (cùng hằng với số "Đã giữ") nên hai con số không thể lệch nhau.
 * - `poOrReason` theo quy tắc phiếu in: `PRODUCTION` lấy số PO của đơn hàng, `OTHER` lấy `reason`.
 * - `note` ưu tiên ghi chú của dòng vật tư, không có mới lấy ghi chú phiếu.
 * - Mọi cột đặt alias bằng `sql` vì subquery dùng cho cả trang lẫn `sum`; không alias thì `code`
 *   bị mơ hồ giữa `inventoryRequisitions` và `productionJobs`.
 */
export function heldRequisitionLinesSubquery(
  db: Database,
  params: {
    itemId: string;
    keyword?: string;
    departmentId?: string;
    type?: InventoryRequisitionType;
  },
) {
  const poOrReason = sql<
    string | null
  >`case when ${inventoryRequisitions.type} = ${InventoryRequisitionType.PRODUCTION} then ${orders.buyerPoNo} else ${inventoryRequisitions.reason} end`;

  return db
    .select({
      requisitionId: sql<string>`${inventoryRequisitions.id}`.as(
        'requisition_id',
      ),
      code: sql<string>`${inventoryRequisitions.code}`.as('requisition_code'),
      approvedAt: sql<Date | null>`${inventoryRequisitions.approvedAt}`
        .mapWith(inventoryRequisitions.approvedAt)
        .as('approved_at'),
      jobCode: sql<string | null>`${productionJobs.code}`.as('job_code'),
      poOrReason: poOrReason.as('po_or_reason'),
      departmentName: sql<string | null>`${departments.name}`.as(
        'department_name',
      ),
      creatorName: sql<string | null>`${users.fullName}`.as('creator_name'),
      quantity: sql<number>`${inventoryRequisitionItems.quantity}`
        .mapWith(inventoryRequisitionItems.quantity)
        .as('held_quantity'),
      note: sql<
        string | null
      >`coalesce(${inventoryRequisitionItems.note}, ${inventoryRequisitions.note})`.as(
        'held_line_note',
      ),
    })
    .from(inventoryRequisitionItems)
    .innerJoin(
      inventoryRequisitions,
      eq(inventoryRequisitions.id, inventoryRequisitionItems.requisitionId),
    )
    .leftJoin(
      productionJobs,
      eq(productionJobs.id, inventoryRequisitions.productionJobId),
    )
    .leftJoin(
      productionOrders,
      eq(productionOrders.id, inventoryRequisitions.productionOrderId),
    )
    .leftJoin(orders, eq(orders.id, productionOrders.orderId))
    .leftJoin(
      departments,
      eq(departments.id, inventoryRequisitions.departmentId),
    )
    .leftJoin(users, eq(users.id, inventoryRequisitions.createdBy))
    .where(
      and(
        eq(inventoryRequisitions.status, HOLDING_STATUS),
        eq(inventoryRequisitionItems.itemId, params.itemId),
        params.type ? eq(inventoryRequisitions.type, params.type) : undefined,
        params.departmentId
          ? eq(inventoryRequisitions.departmentId, params.departmentId)
          : undefined,
        params.keyword
          ? or(
              unaccentILike(inventoryRequisitions.code, params.keyword),
              unaccentILike(productionJobs.code, params.keyword),
              unaccentILike(orders.buyerPoNo, params.keyword),
              unaccentILike(inventoryRequisitions.reason, params.keyword),
            )
          : undefined,
      ),
    )
    .as('held_requisition_lines');
}

/** Σ SL lãnh các phiếu `ISSUED` theo `(productionJobId, itemId)` — số "Đã lãnh".
 * `GET /production-jobs/:jobId/bom` cũng import hàm này (plain function, không qua DI) để hiển thị
 * "Theo dõi đã lãnh" (`docs/CODEMAPS/production.md`). */
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

/** Nhu cầu BOM còn lại theo `itemId`, không scope theo Job: `Σ max(requiredQty − Đã lãnh, 0)` trên
 * các Job đang mở. Đầu vào của tồn khả dụng (`stockSqlFragments`) — cố ý có thể âm, chỉ báo thiếu,
 * không chặn thao tác nào (khác "Có thể lãnh").
 *
 * Rules:
 * - Trừ phần còn lại, không phải nguyên `requiredQty`, để Job đã lãnh xong không bị trừ thừa.
 * - Job `PENDING` (chưa "Xác nhận kế hoạch") chưa giữ chỗ; Job `COMPLETED` thôi giữ chỗ, phần vật
 *   tư chưa lãnh của nó tự được nhả.
 * - `excludeJobId` bỏ nhu cầu của đúng một Job, dùng khi đo tồn khả dụng trước Job đó (lúc start).
 *
 * See `docs/CODEMAPS/inventory.md`. */
export function remainingBomDemandByItemSubquery(
  db: Database,
  excludeJobId?: string,
) {
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
    .innerJoin(
      productionJobs,
      eq(productionJobs.id, productionJobIssues.productionJobId),
    )
    .leftJoin(
      issued,
      and(
        eq(issued.productionJobId, productionJobIssues.productionJobId),
        eq(issued.itemId, productionJobIssues.itemId),
      ),
    )
    .where(
      and(
        notInArray(productionJobs.status, [
          ProductionJobStatus.PENDING,
          ProductionJobStatus.COMPLETED,
        ]),
        excludeJobId
          ? ne(productionJobIssues.productionJobId, excludeJobId)
          : undefined,
      ),
    )
    .groupBy(productionJobIssues.itemId)
    .as('remaining_bom_demand');
}

/** 3 cột số spread vào các `.select()` đọc dòng vật tư (chi tiết phiếu + popup chọn vật tư), cùng
 * khuôn `itemStockColumns` (`inventory/item-stock.query.ts`). Nơi gọi phải LEFT JOIN sẵn
 * `inventory_balances` + `reservedQuantitySubquery` theo `itemId`. `availableQuantity` không nằm ở
 * đây (nơi gọi join `availableQuantityByItemSubquery`); `issuableQuantity` mới là số dùng để chặn. */
export function requisitionStockColumns(
  reserved: ReturnType<typeof reservedQuantitySubquery>,
) {
  const onHandSql = sql<number>`coalesce(${inventoryBalances.quantity}, 0)`;
  const reservedSql = sql<number>`coalesce(${reserved.reservedQuantity}, 0)`;

  return {
    onHand: onHandSql.mapWith(Number),
    reservedQuantity: reservedSql.mapWith(Number),
    issuableQuantity: sql<number>`(${onHandSql}) - (${reservedSql})`.mapWith(
      Number,
    ),
  };
}
