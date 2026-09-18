import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';

import type { DbTransaction } from '../../database/database.type';
import {
  bomItems,
  bomOperations,
  boms,
  BomType,
  items,
  ItemSelect,
  operations,
  productionJobBomItems,
  ProductionJobBomItemType,
  productionJobIssues,
  productionJobItems,
  productionJobOperations,
  ProductionJobSelect,
  productionJobUnits,
  routingOperations,
  units,
  UnitSelect,
} from '../../database/schemas';

type SnapshotJob = Pick<ProductionJobSelect, 'id' | 'itemId' | 'quantity'>;

/**
 * Dựng snapshot BOM, công đoạn và nhu cầu vật tư cho một Job khi bấm "Bắt đầu sản xuất". Đọc từ
 * master data hiện tại và đóng băng vĩnh viễn vào các bảng `production_job_*`, đúng thứ tự dưới —
 * `snapshotJobBomOperations` cần map id mà `snapshotJobBomItems` vừa tạo, `snapshotJobIssues` đọc
 * lại `production_job_bom_items` vừa ghi. Theo `docs/decisions/job-snapshot-at-start.md` và
 * `docs/decisions/bom-explosion-in-job-demand.md`.
 */
export async function createJobSnapshot(
  tx: DbTransaction,
  job: SnapshotJob,
): Promise<void> {
  const bomId = await getBomId(tx, job.itemId);
  if (!bomId) {
    return;
  }

  const jobBomItemIdByBaseId = await snapshotJobBomItems(tx, job, bomId);
  await snapshotJobBomOperations(tx, job.id, bomId, jobBomItemIdByBaseId);
  await snapshotJobIssues(tx, job);
}

async function getBomId(
  tx: DbTransaction,
  itemId: string,
): Promise<string | null> {
  const [bom] = await tx
    .select({ id: boms.id })
    .from(boms)
    .where(eq(boms.itemId, itemId))
    .limit(1);

  return bom?.id ?? null;
}

/**
 * Nhân bản cây `bom_items` (node COMPONENT/CONSUMABLE) sang `production_job_bom_items`, nổ cấp số
 * lượng `plannedQuantity` — nguồn ghi duy nhất của cột này, mọi route đọc chỉ đọc lại. Cấp 0 (chính
 * FG, không phải một node `bom_items` — `docs/decisions/bom-header-as-level-0-anchor.md`) không
 * snapshot từ `bomItems` mà thành một node `FG` riêng đứng cuối cây, đọc thẳng từ `items`, chỉ khi
 * Cấp 0 có công đoạn. Trả map nguồn → id snapshot mới, khoá theo `bom_items.id` cho node thường và
 * theo `bomId` cho entry FG (không có `bom_items.id` nguồn) để `snapshotJobBomOperations` gắn
 * đúng công đoạn.
 */
type BaseBomItem = typeof bomItems.$inferSelect & {
  item: typeof items.$inferSelect | null;
};

/**
 * Tính số lượng kế hoạch (`plannedQuantity`) luỹ kế theo cây cha-con:
 * - Với node Cấp 1 (không có cha, `parentId === null`): định mức nhân trực tiếp với số lượng Job (`jobQuantity`).
 * - Với node con (`parentId !== null`): định mức nhân với số lượng kế hoạch đã nổ của node cha.
 *
 * Yêu cầu: Danh sách BOM item nguồn phải được duyệt theo thứ tự `level` tăng dần (cha trước con).
 */
function resolvePlannedQuantity(
  parentId: string | null,
  quantity: number,
  jobQuantity: number,
  plannedQtyByBaseId: Map<string, number>,
): number {
  const parentPlannedQty = parentId
    ? (plannedQtyByBaseId.get(parentId) ?? jobQuantity)
    : jobQuantity;
  return parentPlannedQty * quantity;
}

/**
 * Chuyển đổi một node `baseBomItem` sang bản ghi snapshot `production_job_bom_items`:
 * Tận dụng fallback `??`: CONSUMABLE tự lấy từ bảng `items` join sang, COMPONENT lấy từ `bom_items`.
 */
function buildJobBomItem(
  baseBomItem: BaseBomItem,
  jobId: string,
  jobBomItemId: string,
  jobParentId: string | null,
  plannedQuantity: number,
): typeof productionJobBomItems.$inferInsert {
  return {
    id: jobBomItemId,
    productionJobId: jobId,
    parentId: jobParentId,
    itemType:
      baseBomItem.type === BomType.CONSUMABLE
        ? ProductionJobBomItemType.CONSUMABLE
        : ProductionJobBomItemType.COMPONENT,
    code: (baseBomItem.item?.code ?? baseBomItem.code)!,
    name: (baseBomItem.item?.name ?? baseBomItem.name)!,
    quantity: baseBomItem.quantity,
    plannedQuantity,
    sortOrder: baseBomItem.sortOrder,
    level: baseBomItem.level,
    itemId: baseBomItem.itemId,
    imageFileId:
      baseBomItem.item?.imageFileId ?? baseBomItem.imageFileId ?? null,
  };
}

/**
 * Dựng node Cấp 0 (FG - thành phẩm chính) ở cuối cây BOM khi sản phẩm có công đoạn lắp ráp Cấp 0
 * (`routing_operations.bomId`). Xem `docs/decisions/bom-header-as-level-0-anchor.md`.
 */
async function buildFgBomItem(
  tx: DbTransaction,
  job: SnapshotJob,
  bomId: string,
  sortOrder: number,
): Promise<{
  fgItemId: string;
  item: typeof productionJobBomItems.$inferInsert;
} | null> {
  const [fgStep] = await tx
    .select({ id: routingOperations.id })
    .from(routingOperations)
    .where(eq(routingOperations.bomId, bomId))
    .limit(1);

  if (!fgStep) {
    return null;
  }

  const [fgItem] = await tx
    .select({ ...getTableColumns(items) })
    .from(items)
    .where(eq(items.id, job.itemId))
    .limit(1);

  const fgItemId = crypto.randomUUID();

  return {
    fgItemId,
    item: {
      id: fgItemId,
      productionJobId: job.id,
      parentId: null,
      itemType: ProductionJobBomItemType.FG,
      code: fgItem.code,
      name: fgItem.name,
      quantity: 1,
      plannedQuantity: job.quantity,
      sortOrder,
      level: 0,
      itemId: job.itemId,
      imageFileId: fgItem.imageFileId,
    },
  };
}

/**
 * Nhân bản cây `bom_items` (node COMPONENT/CONSUMABLE) sang `production_job_bom_items`, nổ cấp số
 * lượng `plannedQuantity` — nguồn ghi duy nhất của cột này, mọi route đọc chỉ đọc lại. Cấp 0 (chính
 * FG, không phải một node `bom_items` — `docs/decisions/bom-header-as-level-0-anchor.md`) không
 * snapshot từ `bomItems` mà thành một node `FG` riêng đứng cuối cây, đọc thẳng từ `items`, chỉ khi
 * Cấp 0 có công đoạn. Trả map nguồn → id snapshot mới, khoá theo `bom_items.id` cho node thường và
 * theo `bomId` cho entry FG (không có `bom_items.id` nguồn) để `snapshotJobBomOperations` gắn
 * đúng công đoạn.
 */
async function snapshotJobBomItems(
  tx: DbTransaction,
  job: SnapshotJob,
  bomId: string,
): Promise<Map<string, string>> {
  const baseBomItems = await tx
    .select({ ...getTableColumns(bomItems), item: getTableColumns(items) })
    .from(bomItems)
    .leftJoin(items, eq(items.id, bomItems.itemId))
    .where(eq(bomItems.bomId, bomId))
    .orderBy(asc(bomItems.level), asc(bomItems.sortOrder));

  const jobBomItemIdByBaseId = new Map<string, string>();
  const plannedQtyByBaseId = new Map<string, number>();
  const itemsToCreate: (typeof productionJobBomItems.$inferInsert)[] = [];

  let maxSortOrder = -1;

  // Yêu cầu `baseBomItems` sắp cha-trước-con (`orderBy level`) — id cha luôn có sẵn trong map khi
  // tới con, cho phép tính luỹ kế `plannedQuantity` trong đúng một vòng lặp.
  for (const baseBomItem of baseBomItems) {
    const jobBomItemId = crypto.randomUUID();
    jobBomItemIdByBaseId.set(baseBomItem.id, jobBomItemId);

    maxSortOrder = Math.max(maxSortOrder, baseBomItem.sortOrder);

    const jobParentId =
      (baseBomItem.parentId &&
        jobBomItemIdByBaseId.get(baseBomItem.parentId)) ??
      null;

    const plannedQuantity = resolvePlannedQuantity(
      baseBomItem.parentId,
      baseBomItem.quantity,
      job.quantity,
      plannedQtyByBaseId,
    );
    plannedQtyByBaseId.set(baseBomItem.id, plannedQuantity);

    itemsToCreate.push(
      buildJobBomItem(
        baseBomItem,
        job.id,
        jobBomItemId,
        jobParentId,
        plannedQuantity,
      ),
    );
  }

  // Node Cấp 0 (FG) — bổ sung cuối cây nếu Cấp 0 có định nghĩa công đoạn
  const fgNode = await buildFgBomItem(tx, job, bomId, maxSortOrder + 1);
  if (fgNode) {
    // Không có `bom_items.id` nguồn cho Cấp 0 — dùng `bomId` làm khoá map để
    // `snapshotJobBomOperations` gắn đúng công đoạn Cấp 0 (`routing_operations.bomId`).
    jobBomItemIdByBaseId.set(bomId, fgNode.fgItemId);
    itemsToCreate.push(fgNode.item);
  }

  if (itemsToCreate.length) {
    await tx.insert(productionJobBomItems).values(itemsToCreate);
  }

  return jobBomItemIdByBaseId;
}

/**
 * Copy công đoạn as-used sang `production_job_operations` cho mọi node vừa snapshot lẫn node FG —
 * 2 nguồn đọc khác nhau vì khác bảng lưu: `bom_operations` (node COMPONENT, khoá `bomItemId`) và
 * `routing_operations` (Cấp 0, khoá `bomId` —
 * `docs/decisions/routing-operations-table.md`), gộp trước khi insert. Node CONSUMABLE không có
 * `bom_operations` (chặn từ lúc ghi) nên tự nhiên không sinh dòng nào, không cần lọc riêng.
 */
async function snapshotJobBomOperations(
  tx: DbTransaction,
  productionJobId: string,
  bomId: string,
  jobBomItemIdByBaseId: Map<string, string>,
): Promise<void> {
  const baseBomItemIds = [...jobBomItemIdByBaseId.keys()].filter(
    (id) => id !== bomId,
  );

  const [nodeSteps, fgSteps] = await Promise.all([
    baseBomItemIds.length
      ? tx
          .select({
            ...getTableColumns(bomOperations),
            operation: getTableColumns(operations),
          })
          .from(bomOperations)
          .innerJoin(operations, eq(operations.id, bomOperations.operationId))
          .where(inArray(bomOperations.bomItemId, baseBomItemIds))
          .orderBy(asc(bomOperations.sortOrder), asc(bomOperations.createdAt))
      : Promise.resolve([]),
    tx
      .select({
        ...getTableColumns(routingOperations),
        operation: getTableColumns(operations),
      })
      .from(routingOperations)
      .innerJoin(operations, eq(operations.id, routingOperations.operationId))
      .where(eq(routingOperations.bomId, bomId))
      .orderBy(
        asc(routingOperations.sortOrder),
        asc(routingOperations.createdAt),
      ),
  ]);

  const operationsToCreate = [
    ...nodeSteps.map((step) => ({
      productionJobId,
      productionJobBomItemId: jobBomItemIdByBaseId.get(step.bomItemId)!,
      operationId: step.operationId,
      code: step.operation.code,
      name: step.operation.name,
      type: step.type,
      sortOrder: step.sortOrder,
      note: step.note,
    })),
    ...fgSteps.map((step) => ({
      productionJobId,
      productionJobBomItemId: jobBomItemIdByBaseId.get(bomId)!,
      operationId: step.operationId,
      code: step.operation.code,
      name: step.operation.name,
      type: step.type,
      sortOrder: step.sortOrder,
      note: step.note,
    })),
  ];

  if (operationsToCreate.length) {
    await tx.insert(productionJobOperations).values(operationsToCreate);
  }
}

/**
 * Tổng hợp nhu cầu vật tư (CONSUMABLE) đã nổ cấp từ `production_job_bom_items`, get-or-create hai
 * bảng chiều `productionJobItems`/`productionJobUnits` rồi ghi vào `production_job_issues`.
 */
async function snapshotJobIssues(
  tx: DbTransaction,
  job: SnapshotJob,
): Promise<void> {
  const consumableDemandRows = await tx
    .select({
      item: getTableColumns(items),
      unit: getTableColumns(units),
      requiredQty:
        sql<number>`sum(${productionJobBomItems.plannedQuantity})`.mapWith(
          Number,
        ),
    })
    .from(productionJobBomItems)
    .innerJoin(items, eq(productionJobBomItems.itemId, items.id))
    .innerJoin(units, eq(items.unitId, units.id))
    .where(
      and(
        eq(productionJobBomItems.productionJobId, job.id),
        eq(productionJobBomItems.itemType, ProductionJobBomItemType.CONSUMABLE),
      ),
    )
    // Group theo khoá chính của `items`/`units` — Postgres tự suy ra mọi cột còn lại của 2 bảng
    // này phụ thuộc hàm vào khoá chính, nên select được nguyên `getTableColumns` mà không phải
    // liệt kê từng cột trong GROUP BY.
    .groupBy(items.id, units.id)
    // `plannedQuantity` không có CHECK `> 0` (định mức lẻ nhiều cấp có thể tròn về 0 ở scale 3),
    // trong khi `production_job_issues.required_qty` có — lọc ngay ở DB thay vì đọc thừa về app.
    .having(sql`sum(${productionJobBomItems.plannedQuantity}) > 0`);

  if (!consumableDemandRows.length) {
    return;
  }

  const jobItemIdByKey = await getOrCreateJobItemIds(tx, consumableDemandRows);
  const jobUnitIdByKey = await getOrCreateJobUnitIds(tx, consumableDemandRows);

  await tx.insert(productionJobIssues).values(
    consumableDemandRows.map((row) => ({
      productionJobId: job.id,
      itemId: row.item.id,
      productionJobItemId: jobItemIdByKey.get(
        dimensionKey(row.item.id, row.item.code, row.item.name),
      )!,
      productionJobUnitId: jobUnitIdByKey.get(
        dimensionKey(row.unit.id, row.unit.code, row.unit.name),
      )!,
      imageFileId: row.item.imageFileId,
      unitQty: row.requiredQty / job.quantity,
      requiredQty: row.requiredQty,
    })),
  );
}

/**
 * Get-or-create `production_job_items`, trả map `dimensionKey → id`. `ON CONFLICT DO NOTHING`
 * không `RETURNING` dòng đã có, nên luôn `SELECT` lại theo `itemId` (cột dẫn đầu của unique) rồi
 * ghép bộ ba trong bộ nhớ — không cần join lại `items` sống, `consumableDemandRows` đã mang đúng
 * code/name tại thời điểm đọc trong cùng `tx`. `SELECT` lại thấy đủ dòng phụ thuộc READ COMMITTED
 * (mặc định Postgres, `.claude/rules/transactions.md` cấm đổi isolation).
 */
async function getOrCreateJobItemIds(
  tx: DbTransaction,
  consumableDemandRows: { item: Pick<ItemSelect, 'id' | 'code' | 'name'> }[],
): Promise<Map<string, string>> {
  const rowsToInsert = [
    ...new Map(
      consumableDemandRows.map((row) => [
        dimensionKey(row.item.id, row.item.code, row.item.name),
        { itemId: row.item.id, code: row.item.code, name: row.item.name },
      ]),
    ).values(),
  ].sort((a, b) => (a.itemId < b.itemId ? -1 : 1));

  await tx
    .insert(productionJobItems)
    .values(rowsToInsert)
    .onConflictDoNothing({
      target: [
        productionJobItems.itemId,
        productionJobItems.code,
        productionJobItems.name,
      ],
    });

  const jobItems = await tx
    .select({
      id: productionJobItems.id,
      itemId: productionJobItems.itemId,
      code: productionJobItems.code,
      name: productionJobItems.name,
    })
    .from(productionJobItems)
    .where(
      inArray(
        productionJobItems.itemId,
        rowsToInsert.map((row) => row.itemId),
      ),
    );

  return new Map(
    jobItems.map((row) => [
      dimensionKey(row.itemId, row.code, row.name),
      row.id,
    ]),
  );
}

/** Song sinh của `getOrCreateJobItemIds` cho `production_job_units` — cùng lý lẽ `DO NOTHING` +
 * đọc lại, cùng ràng buộc READ COMMITTED. */
async function getOrCreateJobUnitIds(
  tx: DbTransaction,
  consumableDemandRows: { unit: Pick<UnitSelect, 'id' | 'code' | 'name'> }[],
): Promise<Map<string, string>> {
  const rowsToInsert = [
    ...new Map(
      consumableDemandRows.map((row) => [
        dimensionKey(row.unit.id, row.unit.code, row.unit.name),
        { unitId: row.unit.id, code: row.unit.code, name: row.unit.name },
      ]),
    ).values(),
  ].sort((a, b) => (a.unitId < b.unitId ? -1 : 1));

  await tx
    .insert(productionJobUnits)
    .values(rowsToInsert)
    .onConflictDoNothing({
      target: [
        productionJobUnits.unitId,
        productionJobUnits.code,
        productionJobUnits.name,
      ],
    });

  const jobUnits = await tx
    .select({
      id: productionJobUnits.id,
      unitId: productionJobUnits.unitId,
      code: productionJobUnits.code,
      name: productionJobUnits.name,
    })
    .from(productionJobUnits)
    .where(
      inArray(
        productionJobUnits.unitId,
        rowsToInsert.map((row) => row.unitId),
      ),
    );

  return new Map(
    jobUnits.map((row) => [
      dimensionKey(row.unitId, row.code, row.name),
      row.id,
    ]),
  );
}

/** Khoá bộ ba của hai bảng chiều — `JSON.stringify` một tuple, tránh tự bịa dấu phân cách:
 * `code`/`name` là text tự do, một delimiter tự chọn luôn có rủi ro trùng lặp giả. */
function dimensionKey(id: string, code: string, name: string): string {
  return JSON.stringify([id, code, name]);
}
