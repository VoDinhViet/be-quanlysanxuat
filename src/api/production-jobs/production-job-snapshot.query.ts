import { asc, eq, getTableColumns, inArray } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  bomItems,
  bomOperations,
  boms,
  BomType,
  items,
  ItemSelect,
  operations,
  OperationType,
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

type JobPlanBomItem = typeof productionJobBomItems.$inferInsert & {
  id: string;
};

export type JobPlanOperation = {
  id: string;
  productionJobBomItemId: string;
  operationId: string;
  code: string;
  name: string;
  type: OperationType;
  sortOrder: number;
  note: string | null;
};

export type JobPlanIssue = {
  item: ItemSelect;
  unit: UnitSelect;
  requiredQty: number;
};

export type JobPlan = {
  bomItems: JobPlanBomItem[];
  operations: JobPlanOperation[];
  issues: JobPlanIssue[];
};

type BaseBomItem = typeof bomItems.$inferSelect & { item: ItemSelect | null };

/**
 * Kế hoạch của Job tính từ master data hiện tại × SL Job, chỉ trên bộ nhớ: cây BOM đã nổ cấp,
 * công đoạn as-used, nhu cầu vật tư gộp. Job `PENDING` đọc thẳng hàm này (luôn khớp sản phẩm
 * đang sửa, gọi trong một transaction chỉ đọc cho nhất quán); `createJobSnapshot` ghi đúng kết quả
 * này khi xác nhận kế hoạch
 * (`docs/adr/0029-job-snapshot-at-start.md`, `docs/adr/0014-bom-explosion-in-job-demand.md`).
 */
export async function buildJobPlan(
  db: Database | DbTransaction,
  job: SnapshotJob,
): Promise<JobPlan> {
  const [bom] = await db
    .select({ id: boms.id })
    .from(boms)
    .where(eq(boms.itemId, job.itemId))
    .limit(1);

  if (!bom) {
    return { bomItems: [], operations: [], issues: [] };
  }

  const baseBomItems: BaseBomItem[] = await db
    .select({ ...getTableColumns(bomItems), item: getTableColumns(items) })
    .from(bomItems)
    .leftJoin(items, eq(items.id, bomItems.itemId))
    .where(eq(bomItems.bomId, bom.id))
    .orderBy(asc(bomItems.level), asc(bomItems.sortOrder));

  const { planBomItems, jobBomItemIdByBaseId } = await buildPlanBomItems(
    db,
    job,
    bom.id,
    baseBomItems,
  );
  const planOperations = await buildPlanOperations(
    db,
    bom.id,
    jobBomItemIdByBaseId,
  );
  const planIssues = await buildPlanIssues(db, baseBomItems, planBomItems);

  return {
    bomItems: planBomItems,
    operations: planOperations,
    issues: planIssues,
  };
}

/**
 * Đóng băng kế hoạch vào các bảng `production_job_*` khi bấm "Xác nhận kế hoạch". Gọi trong
 * transaction của `startJob`.
 */
export async function createJobSnapshot(
  tx: DbTransaction,
  job: SnapshotJob,
): Promise<void> {
  const plan = await buildJobPlan(tx, job);

  if (plan.bomItems.length) {
    await tx.insert(productionJobBomItems).values(plan.bomItems);
  }

  if (plan.operations.length) {
    await tx.insert(productionJobOperations).values(
      plan.operations.map((operation) => ({
        id: operation.id,
        productionJobId: job.id,
        productionJobBomItemId: operation.productionJobBomItemId,
        operationId: operation.operationId,
        code: operation.code,
        name: operation.name,
        type: operation.type,
        sortOrder: operation.sortOrder,
        note: operation.note,
      })),
    );
  }

  await snapshotJobIssues(tx, job, plan.issues);
}

/**
 * Nhân bản cây `bom_items` sang node của Job, nổ cấp `plannedQuantity` (cha trước con nhờ
 * `orderBy level`). Cấp 0 không phải một node `bom_items` (`docs/adr/0030-bom-header-as-level-0-anchor.md`)
 * nên thành một node `FG` riêng đứng cuối cây, chỉ khi Cấp 0 có công đoạn. Map nguồn → id node
 * Job khoá theo `bom_items.id`, riêng node FG khoá theo `bomId` để gắn công đoạn Cấp 0.
 */
async function buildPlanBomItems(
  db: Database | DbTransaction,
  job: SnapshotJob,
  bomId: string,
  baseBomItems: BaseBomItem[],
): Promise<{
  planBomItems: JobPlanBomItem[];
  jobBomItemIdByBaseId: Map<string, string>;
}> {
  const jobBomItemIdByBaseId = new Map<string, string>();
  const plannedQtyByBaseId = new Map<string, number>();
  const planBomItems: JobPlanBomItem[] = [];

  for (const baseBomItem of baseBomItems) {
    const jobBomItemId = crypto.randomUUID();
    jobBomItemIdByBaseId.set(baseBomItem.id, jobBomItemId);

    let parentPlannedQty = job.quantity;
    if (baseBomItem.parentId) {
      const plannedQtyOfParent = plannedQtyByBaseId.get(baseBomItem.parentId);
      if (plannedQtyOfParent === undefined) {
        throw new Error(
          `BOM item ${baseBomItem.id} đứng trước node cha ${baseBomItem.parentId} khi nổ cấp`,
        );
      }
      parentPlannedQty = plannedQtyOfParent;
    }
    const plannedQuantity = parentPlannedQty * baseBomItem.quantity;
    plannedQtyByBaseId.set(baseBomItem.id, plannedQuantity);

    planBomItems.push({
      id: jobBomItemId,
      productionJobId: job.id,
      parentId:
        (baseBomItem.parentId &&
          jobBomItemIdByBaseId.get(baseBomItem.parentId)) ??
        null,
      itemType:
        baseBomItem.type === BomType.DIRECT
          ? ProductionJobBomItemType.DIRECT
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
    });
  }

  const [fgStep] = await db
    .select({ id: routingOperations.id })
    .from(routingOperations)
    .where(eq(routingOperations.bomId, bomId))
    .limit(1);

  if (fgStep) {
    const [fgItem] = await db
      .select()
      .from(items)
      .where(eq(items.id, job.itemId))
      .limit(1);
    const fgNodeId = crypto.randomUUID();
    jobBomItemIdByBaseId.set(bomId, fgNodeId);
    planBomItems.push({
      id: fgNodeId,
      productionJobId: job.id,
      parentId: null,
      itemType: ProductionJobBomItemType.FG,
      code: fgItem.code,
      name: fgItem.name,
      quantity: 1,
      plannedQuantity: job.quantity,
      sortOrder:
        Math.max(-1, ...baseBomItems.map((node) => node.sortOrder)) + 1,
      level: 0,
      itemId: job.itemId,
      imageFileId: fgItem.imageFileId,
    });
  }

  return { planBomItems, jobBomItemIdByBaseId };
}

/**
 * Công đoạn as-used của mọi node: `bom_operations` (node COMPONENT) và `routing_operations`
 * (Cấp 0, `docs/adr/0032-routing-operations-table.md`). Node DIRECT không có công đoạn (chặn từ
 * lúc ghi).
 */
async function buildPlanOperations(
  db: Database | DbTransaction,
  bomId: string,
  jobBomItemIdByBaseId: Map<string, string>,
): Promise<JobPlanOperation[]> {
  const baseBomItemIds = [...jobBomItemIdByBaseId.keys()].filter(
    (id) => id !== bomId,
  );

  const nodeSteps = baseBomItemIds.length
    ? await db
        .select({
          ...getTableColumns(bomOperations),
          operation: getTableColumns(operations),
        })
        .from(bomOperations)
        .innerJoin(operations, eq(operations.id, bomOperations.operationId))
        .where(inArray(bomOperations.bomItemId, baseBomItemIds))
        .orderBy(asc(bomOperations.sortOrder), asc(bomOperations.createdAt))
    : [];
  const fgSteps = await db
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
    );

  return [
    ...nodeSteps.map((step) => ({
      id: crypto.randomUUID(),
      productionJobBomItemId: jobBomItemIdByBaseId.get(step.bomItemId)!,
      operationId: step.operationId,
      code: step.operation.code,
      name: step.operation.name,
      type: step.type,
      sortOrder: step.sortOrder,
      note: step.note,
    })),
    ...fgSteps.map((step) => ({
      id: crypto.randomUUID(),
      productionJobBomItemId: jobBomItemIdByBaseId.get(bomId)!,
      operationId: step.operationId,
      code: step.operation.code,
      name: step.operation.name,
      type: step.type,
      sortOrder: step.sortOrder,
      note: step.note,
    })),
  ];
}

/**
 * Nhu cầu vật tư đã nổ cấp: Σ `plannedQuantity` các node DIRECT theo `itemId` (không làm tròn từng
 * node), chỉ làm tròn scale 6 một lần ở tổng — khớp cột numeric, gọt rác dấu phẩy động cho bản xem
 * trước Job `PENDING`; bỏ dòng tròn về 0 (`production_job_issues.required_qty` có CHECK `> 0`).
 */
async function buildPlanIssues(
  db: Database | DbTransaction,
  baseBomItems: BaseBomItem[],
  planBomItems: JobPlanBomItem[],
): Promise<JobPlanIssue[]> {
  const itemById = new Map(
    baseBomItems.flatMap((node) =>
      node.item ? [[node.item.id, node.item]] : [],
    ),
  );
  const requiredQtyByItemId = new Map<string, number>();
  for (const node of planBomItems) {
    if (node.itemType !== ProductionJobBomItemType.DIRECT || !node.itemId) {
      continue;
    }
    requiredQtyByItemId.set(
      node.itemId,
      (requiredQtyByItemId.get(node.itemId) ?? 0) + node.plannedQuantity,
    );
  }

  const unitIds = [
    ...new Set(
      [...requiredQtyByItemId.keys()].map((id) => itemById.get(id)!.unitId),
    ),
  ];
  if (!unitIds.length) {
    return [];
  }
  const unitRows = await db
    .select()
    .from(units)
    .where(inArray(units.id, unitIds));
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));

  return [...requiredQtyByItemId]
    .map(([itemId, requiredQty]) => {
      const item = itemById.get(itemId)!;
      return {
        item,
        unit: unitById.get(item.unitId)!,
        requiredQty: Math.round(requiredQty * 1e6) / 1e6,
      };
    })
    .filter((issue) => issue.requiredQty > 0)
    .sort((a, b) => a.item.code.localeCompare(b.item.code));
}

/** Ghi nhu cầu vật tư, get-or-create hai bảng chiều `production_job_items`/`_units`. */
async function snapshotJobIssues(
  tx: DbTransaction,
  job: SnapshotJob,
  issues: JobPlanIssue[],
): Promise<void> {
  if (!issues.length) {
    return;
  }

  const jobItemIdByKey = await getOrCreateJobItemIds(tx, issues);
  const jobUnitIdByKey = await getOrCreateJobUnitIds(tx, issues);

  await tx.insert(productionJobIssues).values(
    issues.map((issue) => ({
      productionJobId: job.id,
      itemId: issue.item.id,
      productionJobItemId: jobItemIdByKey.get(
        dimensionKey(issue.item.id, issue.item.code, issue.item.name),
      )!,
      productionJobUnitId: jobUnitIdByKey.get(
        dimensionKey(issue.unit.id, issue.unit.code, issue.unit.name),
      )!,
      imageFileId: issue.item.imageFileId,
      unitQty: issue.requiredQty / job.quantity,
      requiredQty: issue.requiredQty,
    })),
  );
}

/**
 * Get-or-create `production_job_items`, trả map `dimensionKey → id`. `ON CONFLICT DO NOTHING`
 * không `RETURNING` dòng đã có, nên luôn `SELECT` lại theo `itemId` (cột dẫn đầu của unique) rồi
 * ghép bộ ba trong bộ nhớ — không cần join lại `items` sống, `directDemandRows` đã mang đúng
 * code/name tại thời điểm đọc trong cùng `tx`. `SELECT` lại thấy đủ dòng phụ thuộc READ COMMITTED
 * (mặc định Postgres, `.claude/rules/transactions.md` cấm đổi isolation).
 */
async function getOrCreateJobItemIds(
  tx: DbTransaction,
  directDemandRows: { item: Pick<ItemSelect, 'id' | 'code' | 'name'> }[],
): Promise<Map<string, string>> {
  const rowsToInsert = [
    ...new Map(
      directDemandRows.map((row) => [
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
  directDemandRows: { unit: Pick<UnitSelect, 'id' | 'code' | 'name'> }[],
): Promise<Map<string, string>> {
  const rowsToInsert = [
    ...new Map(
      directDemandRows.map((row) => [
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
