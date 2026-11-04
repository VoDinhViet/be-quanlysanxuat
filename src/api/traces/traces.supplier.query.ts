import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import { asNumber, asText } from '../../common/summary/summary.sql';
import type { DbTransaction } from '../../database/database.type';
import {
  clients,
  InventoryDocumentStatus,
  orders,
  OrderStatus,
  outsourcingOrders,
  productionOrders,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  qualityInspections,
  supplierReturns,
  suppliers,
} from '../../database/schemas';
import { isActiveFailedInspection } from '../iqc/iqc.predicate';
import { OUTSOURCING_AWAITING_RETURN_STATUSES } from '../outsourcing-orders/outsourcing-orders.constant';
import { isOpenPurchaseOrder } from '../purchase-orders/purchase-orders.predicate';
import { TRACE_STEP_LIMIT, TraceStep } from './traces.constant';
import { NO_NUMBER, NO_TEXT, toStep } from './traces.shared.query';
import type { TraceStepRow } from './traces.shared.query';

// Số nhà cung cấp tối đa một lần truy vết, khi từ khoá tên khớp nhiều nhà cung cấp
const MAX_MATCHED_SUPPLIERS = 3;
// Phiếu kiểm không đạt trong ngần này ngày gần đây mới tính là rủi ro hiện tại
const RECENT_FAILURE_DAYS = 90;
// Đơn bán đã xong, huỷ hoặc bị từ chối thì không còn chờ vật tư
const CLOSED_ORDER_STATUSES = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
];

// Ký tự đặc biệt của LIKE trong từ khoá người dùng phải được thoát, nếu không `%` khớp mọi tên
function escapeLikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Nhà cung cấp khớp mã chính xác hoặc một phần tên (không phân biệt hoa thường). */
export function findSuppliersByKeyword(
  tx: DbTransaction,
  keyword: string,
): Promise<TraceStepRow[]> {
  return tx
    .select({
      id: suppliers.id,
      step: toStep(TraceStep.SUPPLIER),
      code: suppliers.code,
      status: asText(suppliers.status),
      dueDate: NO_TEXT,
      quantity: NO_NUMBER,
      parentCode: NO_TEXT,
      note: sql<string | null>`${suppliers.name}`,
    })
    .from(suppliers)
    .where(
      and(
        isNull(suppliers.deletedAt),
        or(
          eq(suppliers.code, keyword),
          ilike(suppliers.name, `%${escapeLikePattern(keyword)}%`),
        ),
      ),
    )
    .orderBy(sql`(${suppliers.code} = ${keyword}) desc`, asc(suppliers.name))
    .limit(MAX_MATCHED_SUPPLIERS);
}

/** Điều kiện đơn mua còn mở của các nhà cung cấp: đã đặt và chưa đóng. */
export function openPurchaseOrdersOf(supplierIds: string[]) {
  return and(
    inArray(purchaseOrders.supplierId, supplierIds),
    isOpenPurchaseOrder(),
  );
}

/** Phiếu kiểm không đạt gần đây của nhà cung cấp, gắn với đơn mua bị ảnh hưởng. */
export function findRecentFailedInspections(
  tx: DbTransaction,
  supplierIds: string[],
): Promise<TraceStepRow[]> {
  return tx
    .select({
      id: qualityInspections.id,
      step: toStep(TraceStep.IQC),
      code: qualityInspections.inspectionNo,
      status: asText(qualityInspections.status),
      dueDate: NO_TEXT,
      quantity: asNumber(qualityInspections.quantity),
      parentCode: sql<string | null>`${purchaseOrders.code}`,
      note: sql<
        string | null
      >`'FAIL / ' || coalesce(${qualityInspections.disposition}::text, '-')`,
    })
    .from(qualityInspections)
    .leftJoin(
      purchaseOrders,
      eq(purchaseOrders.id, qualityInspections.purchaseOrderId),
    )
    .where(
      and(
        inArray(qualityInspections.supplierId, supplierIds),
        isActiveFailedInspection(),
        sql`${qualityInspections.createdAt} >= now() - make_interval(days => ${RECENT_FAILURE_DAYS})`,
      ),
    )
    .orderBy(desc(qualityInspections.createdAt))
    .limit(TRACE_STEP_LIMIT);
}

/** Phiếu trả nhà cung cấp còn nháp, tức hàng trả chưa xuất kho. */
export function findPendingSupplierReturns(
  tx: DbTransaction,
  supplierIds: string[],
): Promise<TraceStepRow[]> {
  return tx
    .select({
      id: supplierReturns.id,
      step: toStep(TraceStep.SUPPLIER_RETURN),
      code: supplierReturns.code,
      status: asText(supplierReturns.status),
      dueDate: NO_TEXT,
      quantity: asNumber(supplierReturns.quantity),
      parentCode: sql<string | null>`${purchaseOrders.code}`,
      note: sql<string | null>`${supplierReturns.itemCode}`,
    })
    .from(supplierReturns)
    .leftJoin(
      purchaseOrders,
      eq(purchaseOrders.id, supplierReturns.purchaseOrderId),
    )
    .where(
      and(
        inArray(supplierReturns.supplierId, supplierIds),
        eq(supplierReturns.status, InventoryDocumentStatus.DRAFT),
      ),
    )
    .orderBy(asc(supplierReturns.code))
    .limit(TRACE_STEP_LIMIT);
}

export function findOpenOutsourcingOrders(
  tx: DbTransaction,
  supplierIds: string[],
): Promise<TraceStepRow[]> {
  return tx
    .select({
      id: outsourcingOrders.id,
      step: toStep(TraceStep.OUTSOURCING_ORDER),
      code: outsourcingOrders.code,
      status: asText(outsourcingOrders.status),
      dueDate: asText(outsourcingOrders.expectedReturnDate),
      quantity: NO_NUMBER,
      parentCode: NO_TEXT,
      note: NO_TEXT,
    })
    .from(outsourcingOrders)
    .where(
      and(
        inArray(outsourcingOrders.supplierId, supplierIds),
        inArray(outsourcingOrders.status, OUTSOURCING_AWAITING_RETURN_STATUSES),
      ),
    )
    .orderBy(asc(outsourcingOrders.expectedReturnDate))
    .limit(TRACE_STEP_LIMIT);
}

/**
 * Đơn bán đang chờ vật tư từ các đơn mua đã cho (đề nghị mua thiếu vật tư của job, lệnh sản xuất).
 * `parentCode` liệt kê đơn mua gây ảnh hưởng, `note` là khách hàng.
 */
export function findOrdersWaitingOnPurchaseOrders(
  tx: DbTransaction,
  purchaseOrderIds: string[],
): Promise<TraceStepRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: orders.id,
      step: toStep(TraceStep.ORDER),
      code: orders.code,
      status: asText(orders.status),
      dueDate: asText(orders.dueDate),
      quantity: NO_NUMBER,
      parentCode: sql<
        string | null
      >`string_agg(distinct ${purchaseOrders.code}, ', ')`,
      note: sql<string | null>`${clients.name}`,
    })
    .from(purchaseOrderItems)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId),
    )
    .innerJoin(
      purchaseRequestItems,
      eq(purchaseRequestItems.id, purchaseOrderItems.purchaseRequestItemId),
    )
    .innerJoin(
      purchaseRequests,
      eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
    )
    .innerJoin(
      productionOrders,
      eq(productionOrders.id, purchaseRequests.productionOrderId),
    )
    .innerJoin(orders, eq(orders.id, productionOrders.orderId))
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(
      and(
        inArray(purchaseOrderItems.purchaseOrderId, purchaseOrderIds),
        isNull(orders.deletedAt),
        notInArray(orders.status, CLOSED_ORDER_STATUSES),
      ),
    )
    .groupBy(orders.id, clients.name)
    .orderBy(asc(orders.dueDate))
    .limit(TRACE_STEP_LIMIT);
}
