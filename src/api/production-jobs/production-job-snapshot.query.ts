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
  await snapshotJobBomOperations(tx, job.id, jobBomItemIdByBaseId);
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
 * Nhân bản cây `bom_items` (node ROOT/COMPONENT/CONSUMABLE) sang `production_job_bom_items`, nổ
 * cấp số lượng `plannedQuantity` — nguồn ghi duy nhất của cột này, mọi route đọc chỉ đọc lại. Node
 * ROOT ("Cấp 0") không snapshot trực tiếp mà thành một node `FG` riêng đứng cuối cây, chỉ khi ROOT
 * có công đoạn (`docs/decisions/root-bom-item.md`). Trả map `bom_items.id` nguồn → id snapshot mới
 * (gồm cả entry của ROOT nếu có tạo FG) để `snapshotJobBomOperations` gắn đúng công đoạn.
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

  const root = baseBomItems.find(
    (baseBomItem) => baseBomItem.type === BomType.ROOT,
  );
  const nodes = baseBomItems.filter(
    (baseBomItem) => baseBomItem.type !== BomType.ROOT,
  );

  const jobBomItemIdByBaseId = new Map<string, string>();
  const plannedQtyByBaseId = new Map<string, number>();
  const itemsToCreate: (typeof productionJobBomItems.$inferInsert)[] = [];

  let maxSortOrder = -1;

  // Yêu cầu `nodes` sắp cha-trước-con (`orderBy level`) — id cha luôn có sẵn trong map khi tới
  // con, cùng tính chất đó cho phép nhân luỹ kế `plannedQuantity` ngay trong một vòng lặp.
  for (const baseBomItem of nodes) {
    const jobBomItemId = crypto.randomUUID();
    jobBomItemIdByBaseId.set(baseBomItem.id, jobBomItemId);

    if (baseBomItem.sortOrder > maxSortOrder) {
      maxSortOrder = baseBomItem.sortOrder;
    }

    const jobParentId = baseBomItem.parentId
      ? (jobBomItemIdByBaseId.get(baseBomItem.parentId) ?? null)
      : null;
    const parentPlannedQty = baseBomItem.parentId
      ? (plannedQtyByBaseId.get(baseBomItem.parentId) ?? job.quantity)
      : job.quantity;
    const plannedQuantity = parentPlannedQty * baseBomItem.quantity;
    plannedQtyByBaseId.set(baseBomItem.id, plannedQuantity);

    const isConsumable = baseBomItem.type === BomType.CONSUMABLE;

    itemsToCreate.push({
      id: jobBomItemId,
      productionJobId: job.id,
      parentId: jobParentId,
      itemType: isConsumable
        ? ProductionJobBomItemType.CONSUMABLE
        : ProductionJobBomItemType.COMPONENT,
      code: isConsumable ? baseBomItem.item!.code : baseBomItem.code!,
      name: isConsumable ? baseBomItem.item!.name : baseBomItem.name!,
      quantity: baseBomItem.quantity,
      plannedQuantity,
      sortOrder: baseBomItem.sortOrder,
      level: baseBomItem.level,
      itemId: baseBomItem.itemId,
      imageFileId: baseBomItem.item?.imageFileId ?? null,
    });
  }

  if (root) {
    const [rootStep] = await tx
      .select({ id: bomOperations.id })
      .from(bomOperations)
      .where(eq(bomOperations.bomItemId, root.id))
      .limit(1);

    if (rootStep) {
      const finalAssemblyId = crypto.randomUUID();
      jobBomItemIdByBaseId.set(root.id, finalAssemblyId);

      itemsToCreate.push({
        id: finalAssemblyId,
        productionJobId: job.id,
        parentId: null,
        itemType: ProductionJobBomItemType.FG,
        code: root.item!.code,
        name: root.item!.name,
        quantity: 1,
        plannedQuantity: job.quantity,
        sortOrder: maxSortOrder + 1,
        level: 0,
        itemId: root.itemId,
        imageFileId: root.item!.imageFileId,
      });
    }
  }

  if (itemsToCreate.length) {
    await tx.insert(productionJobBomItems).values(itemsToCreate);
  }

  return jobBomItemIdByBaseId;
}

/**
 * Copy công đoạn as-used (`bom_operations`) sang `production_job_operations` cho mọi node vừa
 * snapshot (kể cả node FG) — đọc đúng tập `bom_items.id` nguồn trong `jobBomItemIdByBaseId`, không
 * cần đọc lại `bom_items`. Node CONSUMABLE không có `bom_operations` (chặn từ lúc ghi) nên tự nhiên
 * không sinh dòng nào, không cần lọc riêng.
 */
async function snapshotJobBomOperations(
  tx: DbTransaction,
  productionJobId: string,
  jobBomItemIdByBaseId: Map<string, string>,
): Promise<void> {
  const baseSteps = await tx
    .select({
      ...getTableColumns(bomOperations),
      operation: getTableColumns(operations),
    })
    .from(bomOperations)
    .innerJoin(operations, eq(operations.id, bomOperations.operationId))
    .where(inArray(bomOperations.bomItemId, [...jobBomItemIdByBaseId.keys()]))
    .orderBy(asc(bomOperations.sortOrder), asc(bomOperations.createdAt));

  const operationsToCreate = baseSteps.map((step) => ({
    productionJobId,
    productionJobBomItemId: jobBomItemIdByBaseId.get(step.bomItemId)!,
    operationId: step.operationId,
    code: step.operation.code,
    name: step.operation.name,
    type: step.type,
    sortOrder: step.sortOrder,
    note: step.note,
  }));

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
