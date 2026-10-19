import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm';

import type { DbTransaction } from '../../database/database.type';
import {
  clients,
  orders,
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
import { equalsText, inTexts } from './integration-query.service';
import {
  asNumber,
  asText,
  NO_NUMBER,
  NO_TEXT,
  toStep,
  TRACE_STEP_LIMIT,
  TraceStep,
} from './integration-trace.queries';
import type { TraceRow } from './integration-trace.queries';

// Số nhà cung cấp tối đa một lần truy vết, khi từ khoá tên khớp nhiều nhà cung cấp
const MAX_MATCHED_SUPPLIERS = 3;
// Phiếu kiểm không đạt trong ngần này ngày gần đây mới tính là rủi ro hiện tại
const RECENT_FAILURE_DAYS = 90;
const OPEN_OUTSOURCING_STATUSES = ['SENT', 'PARTIAL', 'WAITING_QC'];

// Ký tự đặc biệt của LIKE trong từ khoá người dùng phải được thoát, nếu không `%` khớp mọi tên
function escapeLikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Nhà cung cấp khớp mã chính xác hoặc một phần tên (không phân biệt hoa thường). */
export function findSuppliersByKeyword(
  tx: DbTransaction,
  keyword: string,
): Promise<TraceRow[]> {
  return tx
    .select({
      id: suppliers.id,
      step: toStep(TraceStep.SUPPLIER),
      code: suppliers.code,
      status: asText(suppliers.status),
      due_date: NO_TEXT,
      quantity: NO_NUMBER,
      parent_code: NO_TEXT,
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
    equalsText(purchaseOrders.status, 'ORDERED'),
    isNull(purchaseOrders.closedAt),
  );
}

/** Phiếu kiểm không đạt gần đây của nhà cung cấp, gắn với đơn mua bị ảnh hưởng. */
export function findRecentFailedInspections(
  tx: DbTransaction,
  supplierIds: string[],
): Promise<TraceRow[]> {
  return tx
    .select({
      id: qualityInspections.id,
      step: toStep(TraceStep.IQC),
      code: qualityInspections.inspectionNo,
      status: asText(qualityInspections.status),
      due_date: NO_TEXT,
      quantity: asNumber(qualityInspections.quantity),
      parent_code: sql<string | null>`${purchaseOrders.code}`,
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
        equalsText(qualityInspections.decision, 'FAIL'),
        sql`${qualityInspections.status}::text <> 'CANCELLED'`,
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
): Promise<TraceRow[]> {
  return tx
    .select({
      id: supplierReturns.id,
      step: toStep(TraceStep.SUPPLIER_RETURN),
      code: supplierReturns.code,
      status: asText(supplierReturns.status),
      due_date: NO_TEXT,
      quantity: asNumber(supplierReturns.quantity),
      parent_code: sql<string | null>`${purchaseOrders.code}`,
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
        equalsText(supplierReturns.status, 'DRAFT'),
      ),
    )
    .orderBy(asc(supplierReturns.code))
    .limit(TRACE_STEP_LIMIT);
}

export function findOpenOutsourcingOrders(
  tx: DbTransaction,
  supplierIds: string[],
): Promise<TraceRow[]> {
  return tx
    .select({
      id: outsourcingOrders.id,
      step: toStep(TraceStep.OUTSOURCING_ORDER),
      code: outsourcingOrders.code,
      status: asText(outsourcingOrders.status),
      due_date: asText(outsourcingOrders.expectedReturnDate),
      quantity: NO_NUMBER,
      parent_code: NO_TEXT,
      note: NO_TEXT,
    })
    .from(outsourcingOrders)
    .where(
      and(
        inArray(outsourcingOrders.supplierId, supplierIds),
        inTexts(outsourcingOrders.status, OPEN_OUTSOURCING_STATUSES),
      ),
    )
    .orderBy(asc(outsourcingOrders.expectedReturnDate))
    .limit(TRACE_STEP_LIMIT);
}

/**
 * Đơn bán đang chờ vật tư từ các đơn mua đã cho (đề nghị mua thiếu vật tư của job, lệnh sản xuất).
 * `parent_code` liệt kê đơn mua gây ảnh hưởng, `note` là khách hàng.
 */
export function findOrdersWaitingOnPurchaseOrders(
  tx: DbTransaction,
  purchaseOrderIds: string[],
): Promise<TraceRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: orders.id,
      step: toStep(TraceStep.ORDER),
      code: orders.code,
      status: asText(orders.status),
      due_date: asText(orders.dueDate),
      quantity: NO_NUMBER,
      parent_code: sql<
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
        sql`${orders.status}::text NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')`,
      ),
    )
    .groupBy(orders.id, clients.name)
    .orderBy(asc(orders.dueDate))
    .limit(TRACE_STEP_LIMIT);
}
