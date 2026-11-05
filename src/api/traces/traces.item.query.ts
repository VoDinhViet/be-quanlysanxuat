import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { asNumber, asText } from '../../common/summary/summary.sql';
import type { DbTransaction } from '../../database/database.type';
import {
  bomItems,
  bomOperations,
  boms,
  inventoryBalances,
  items,
  operations,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  PurchaseRequestStatus,
} from '../../database/schemas';
import { isOpenPurchaseOrder } from '../purchase-orders/purchase-orders.predicate';
import { BOM_TREE_LIMIT, TRACE_STEP_LIMIT, TraceStep } from './traces.constant';
import { NO_NUMBER, NO_TEXT, toStep } from './traces.shared.query';
import type { TraceStepRow } from './traces.shared.query';

// Một mã có thể có nhiều revision; truy vết chỉ lấy vài revision mới nhất
const MAX_MATCHED_ITEMS = 3;
const OPEN_REQUEST_STATUSES = [
  PurchaseRequestStatus.DRAFT,
  PurchaseRequestStatus.PENDING_APPROVAL,
  PurchaseRequestStatus.APPROVED,
];

const productItems = alias(items, 'product_item');

/** Vật tư hoặc sản phẩm theo mã; `quantity` là tồn kho hiện tại, `note` ghi tên và tồn tối thiểu. */
export function findItemsByCode(
  tx: DbTransaction,
  itemCode: string,
): Promise<TraceStepRow[]> {
  return tx
    .select({
      id: items.id,
      step: toStep(TraceStep.ITEM),
      code: items.code,
      status: asText(items.status),
      dueDate: NO_TEXT,
      quantity: asNumber(inventoryBalances.quantity),
      parentCode: asText(items.type),
      note: sql<
        string | null
      >`concat_ws(', ', ${items.name}, 'min stock ' || ${items.minStock}::float8)`,
    })
    .from(items)
    .leftJoin(inventoryBalances, eq(inventoryBalances.itemId, items.id))
    .where(and(isNull(items.deletedAt), eq(items.code, itemCode)))
    .orderBy(desc(items.revision))
    .limit(MAX_MATCHED_ITEMS);
}

/** Sản phẩm có vật tư trong BOM; `quantity` là định mức trên một sản phẩm. */
export function findProductsUsingItems(
  tx: DbTransaction,
  itemIds: string[],
): Promise<TraceStepRow[]> {
  const material = alias(items, 'material');
  return tx
    .select({
      id: items.id,
      step: toStep(TraceStep.BOM),
      code: items.code,
      status: asText(items.status),
      dueDate: NO_TEXT,
      quantity: asNumber(bomItems.quantity),
      parentCode: material.code,
      note: sql<
        string | null
      >`${items.name} || ', level ' || ${bomItems.level}`,
    })
    .from(bomItems)
    .innerJoin(boms, eq(boms.id, bomItems.bomId))
    .innerJoin(items, eq(items.id, boms.itemId))
    .innerJoin(material, eq(material.id, bomItems.itemId))
    .where(
      and(
        inArray(bomItems.itemId, itemIds),
        isNull(items.deletedAt),
        isNull(bomItems.deletedAt),
      ),
    )
    .orderBy(asc(items.code))
    .limit(TRACE_STEP_LIMIT);
}

/** Đề nghị mua còn đang xử lý có chứa vật tư: id đề nghị, dùng làm điều kiện cho `findPurchaseRequests`. */
export function openPurchaseRequestIdsOfItems(
  tx: DbTransaction,
  itemIds: string[],
) {
  return tx
    .select({ id: purchaseRequestItems.purchaseRequestId })
    .from(purchaseRequestItems)
    .innerJoin(
      purchaseRequests,
      eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
    )
    .where(
      and(
        inArray(purchaseRequestItems.itemId, itemIds),
        isNull(purchaseRequestItems.cancelledAt),
        inArray(purchaseRequests.status, OPEN_REQUEST_STATUSES),
      ),
    );
}

/** Đơn mua còn mở có chứa vật tư: id đơn mua, dùng làm điều kiện cho `findPurchaseOrders`. */
export function openPurchaseOrderIdsOfItems(
  tx: DbTransaction,
  itemIds: string[],
) {
  return tx
    .select({ id: purchaseOrderItems.purchaseOrderId })
    .from(purchaseOrderItems)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId),
    )
    .innerJoin(
      purchaseRequestItems,
      eq(purchaseRequestItems.id, purchaseOrderItems.purchaseRequestItemId),
    )
    .where(
      and(inArray(purchaseRequestItems.itemId, itemIds), isOpenPurchaseOrder()),
    );
}

/**
 * Cây BOM của sản phẩm theo tầng đã lưu (`level`), không cần đệ quy. `parentCode` là mã nút cha,
 * rỗng với nút ngay dưới sản phẩm; nút cụm lắp (COMPONENT) không có item nên lấy mã nhập tay.
 */
export function findBomTree(
  tx: DbTransaction,
  productIds: string[],
): Promise<TraceStepRow[]> {
  const parent = alias(bomItems, 'parent');
  const parentItem = alias(items, 'parent_item');
  return tx
    .select({
      id: bomItems.id,
      step: toStep(TraceStep.BOM),
      code: sql<string | null>`coalesce(${items.code}, ${bomItems.code})`,
      status: asText(bomItems.type),
      dueDate: NO_TEXT,
      quantity: asNumber(bomItems.quantity),
      parentCode: sql<
        string | null
      >`coalesce(${parentItem.code}, ${parent.code}, ${productItems.code})`,
      note: sql<
        string | null
      >`coalesce(${items.name}, ${bomItems.name}) || ', level ' || ${bomItems.level}`,
    })
    .from(bomItems)
    .innerJoin(boms, eq(boms.id, bomItems.bomId))
    .innerJoin(productItems, eq(productItems.id, boms.itemId))
    .leftJoin(items, eq(items.id, bomItems.itemId))
    .leftJoin(parent, eq(parent.id, bomItems.parentId))
    .leftJoin(parentItem, eq(parentItem.id, parent.itemId))
    .where(and(inArray(boms.itemId, productIds), isNull(bomItems.deletedAt)))
    .orderBy(asc(bomItems.level), asc(bomItems.sortOrder))
    .limit(BOM_TREE_LIMIT);
}

/** Công đoạn gắn vào từng nút BOM; `parentCode` là mã nút BOM mà công đoạn thuộc về. */
export function findBomOperations(
  tx: DbTransaction,
  productIds: string[],
): Promise<TraceStepRow[]> {
  return tx
    .select({
      id: bomOperations.id,
      step: toStep(TraceStep.OPERATION),
      code: operations.code,
      status: NO_TEXT,
      dueDate: NO_TEXT,
      quantity: NO_NUMBER,
      parentCode: sql<string | null>`coalesce(${items.code}, ${bomItems.code})`,
      note: operations.name,
    })
    .from(bomOperations)
    .innerJoin(bomItems, eq(bomItems.id, bomOperations.bomItemId))
    .innerJoin(boms, eq(boms.id, bomItems.bomId))
    .innerJoin(operations, eq(operations.id, bomOperations.operationId))
    .leftJoin(items, eq(items.id, bomItems.itemId))
    .where(
      and(
        inArray(boms.itemId, productIds),
        isNull(operations.deletedAt),
        isNull(bomOperations.deletedAt),
      ),
    )
    .orderBy(asc(bomItems.level), asc(bomOperations.sortOrder))
    .limit(BOM_TREE_LIMIT);
}
