import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { asNumber, asText } from '../../common/summary/summary.sql';
import type { DbTransaction } from '../../database/database.type';
import {
  inventoryReceiptItems,
  inventoryReceipts,
  orders,
  paymentRequests,
  productionJobs,
  productionOrders,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  qualityInspections,
  QualityInspectionType,
  supplierReturns,
  suppliers,
} from '../../database/schemas';
import { TRACE_STEP_LIMIT, TraceStep } from './traces.constant';
import {
  NO_NUMBER,
  NO_TEXT,
  singleItemQuantity,
  toStep,
} from './traces.shared.query';
import type { TraceStepRow } from './traces.shared.query';

/**
 * Đề nghị mua theo điều kiện `where`. `note` cho biết đơn bán nguồn gốc khi đề nghị thiếu vật
 * tư do job tạo ra; đề nghị tạo tay không có job nên `parentCode` và `note` rỗng.
 */
export function findPurchaseRequests(
  tx: DbTransaction,
  where: SQL | undefined,
): Promise<TraceStepRow[]> {
  return tx
    .select({
      id: purchaseRequests.id,
      step: toStep(TraceStep.PURCHASE_REQUEST),
      code: purchaseRequests.code,
      status: asText(purchaseRequests.status),
      dueDate: asText(purchaseRequests.neededDate),
      quantity: singleItemQuantity(
        purchaseRequestItems.quantity,
        purchaseRequestItems.itemId,
      ),
      parentCode: sql<string | null>`${productionJobs.code}`,
      note: sql<
        string | null
      >`concat_ws(', ', count(${purchaseRequestItems.id}) || ' lines', 'order ' || ${orders.code})`,
    })
    .from(purchaseRequests)
    .leftJoin(
      purchaseRequestItems,
      and(
        eq(purchaseRequestItems.purchaseRequestId, purchaseRequests.id),
        isNull(purchaseRequestItems.cancelledAt),
      ),
    )
    .leftJoin(
      productionJobs,
      eq(productionJobs.id, purchaseRequests.productionJobId),
    )
    .leftJoin(
      productionOrders,
      eq(productionOrders.id, purchaseRequests.productionOrderId),
    )
    .leftJoin(orders, eq(orders.id, productionOrders.orderId))
    .where(where)
    .groupBy(purchaseRequests.id, productionJobs.code, orders.code)
    .orderBy(asc(purchaseRequests.code))
    .limit(TRACE_STEP_LIMIT);
}

export function findPurchaseRequestsOfJobs(
  tx: DbTransaction,
  jobIds: string[],
  productionOrderIds: string[],
): Promise<TraceStepRow[]> {
  const conditions: SQL[] = [];
  if (jobIds.length > 0) {
    conditions.push(inArray(purchaseRequests.productionJobId, jobIds));
  }
  if (productionOrderIds.length > 0) {
    conditions.push(
      inArray(purchaseRequests.productionOrderId, productionOrderIds),
    );
  }
  if (conditions.length === 0) {
    return Promise.resolve([]);
  }
  return findPurchaseRequests(tx, or(...conditions));
}

/** Đề nghị mua đứng sau các đơn mua đã cho (đi ngược dòng từ đơn mua). */
export async function findPurchaseRequestsOfOrders(
  tx: DbTransaction,
  purchaseOrderIds: string[],
): Promise<TraceStepRow[]> {
  if (purchaseOrderIds.length === 0) {
    return [];
  }
  const requestLines = await tx
    .selectDistinct({
      purchaseRequestId: purchaseRequestItems.purchaseRequestId,
    })
    .from(purchaseOrderItems)
    .innerJoin(
      purchaseRequestItems,
      eq(purchaseRequestItems.id, purchaseOrderItems.purchaseRequestItemId),
    )
    .where(inArray(purchaseOrderItems.purchaseOrderId, purchaseOrderIds));
  const purchaseRequestIds = requestLines.map((line) => line.purchaseRequestId);
  if (purchaseRequestIds.length === 0) {
    return [];
  }
  return findPurchaseRequests(
    tx,
    inArray(purchaseRequests.id, purchaseRequestIds),
  );
}

/** Đơn mua theo điều kiện `where`; `parentCode` liệt kê các đề nghị mua đã sinh ra đơn. */
export function findPurchaseOrders(
  tx: DbTransaction,
  where: SQL | undefined,
): Promise<TraceStepRow[]> {
  return tx
    .select({
      id: purchaseOrders.id,
      step: toStep(TraceStep.PURCHASE_ORDER),
      code: purchaseOrders.code,
      status: asText(purchaseOrders.status),
      dueDate: asText(purchaseOrders.expectedDate),
      quantity: singleItemQuantity(
        purchaseOrderItems.quantity,
        purchaseRequestItems.itemId,
      ),
      parentCode: sql<
        string | null
      >`string_agg(distinct ${purchaseRequests.code}, ', ')`,
      note: sql<
        string | null
      >`${suppliers.name} || ', ' || count(distinct ${purchaseOrderItems.id}) || ' lines'`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(
      purchaseOrderItems,
      eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id),
    )
    .leftJoin(
      purchaseRequestItems,
      eq(purchaseRequestItems.id, purchaseOrderItems.purchaseRequestItemId),
    )
    .leftJoin(
      purchaseRequests,
      eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
    )
    .where(where)
    .groupBy(purchaseOrders.id, suppliers.name)
    .orderBy(asc(purchaseOrders.code))
    .limit(TRACE_STEP_LIMIT);
}

export function findPurchaseOrdersOfRequests(
  tx: DbTransaction,
  purchaseRequestIds: string[],
): Promise<TraceStepRow[]> {
  if (purchaseRequestIds.length === 0) {
    return Promise.resolve([]);
  }
  // Lọc theo đề nghị ở truy vấn con để `parentCode` vẫn liệt kê đủ đề nghị của đơn
  const orderIdsOfRequests = tx
    .select({ id: purchaseOrderItems.purchaseOrderId })
    .from(purchaseOrderItems)
    .innerJoin(
      purchaseRequestItems,
      eq(purchaseRequestItems.id, purchaseOrderItems.purchaseRequestItemId),
    )
    .where(inArray(purchaseRequestItems.purchaseRequestId, purchaseRequestIds));
  return findPurchaseOrders(tx, inArray(purchaseOrders.id, orderIdsOfRequests));
}

export function findReceipts(
  tx: DbTransaction,
  purchaseOrderIds: string[],
): Promise<TraceStepRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: inventoryReceipts.id,
      step: toStep(TraceStep.RECEIPT),
      code: inventoryReceipts.code,
      status: asText(inventoryReceipts.status),
      dueDate: NO_TEXT,
      quantity: singleItemQuantity(
        inventoryReceiptItems.quantity,
        inventoryReceiptItems.itemId,
      ),
      parentCode: sql<string | null>`${purchaseOrders.code}`,
      note: sql<
        string | null
      >`concat_ws(', ', count(${inventoryReceiptItems.id}) || ' lines', case when ${inventoryReceipts.requiresIqc} then 'requires_iqc' end)`,
    })
    .from(inventoryReceipts)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.id, inventoryReceipts.purchaseOrderId),
    )
    .leftJoin(
      inventoryReceiptItems,
      eq(inventoryReceiptItems.receiptId, inventoryReceipts.id),
    )
    .where(inArray(inventoryReceipts.purchaseOrderId, purchaseOrderIds))
    .groupBy(inventoryReceipts.id, purchaseOrders.code)
    .orderBy(asc(inventoryReceipts.code))
    .limit(TRACE_STEP_LIMIT);
}

export function findInspections(
  tx: DbTransaction,
  purchaseOrderIds: string[],
): Promise<TraceStepRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
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
      >`coalesce(${qualityInspections.decision}::text, '-') || ' / ' || coalesce(${qualityInspections.disposition}::text, '-')`,
    })
    .from(qualityInspections)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.id, qualityInspections.purchaseOrderId),
    )
    .where(
      and(
        inArray(qualityInspections.purchaseOrderId, purchaseOrderIds),
        eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
      ),
    )
    .orderBy(asc(qualityInspections.inspectionNo))
    .limit(TRACE_STEP_LIMIT);
}

/** Phiếu trả nhà cung cấp; `parentCode` là phiếu kiểm IQC sinh ra nó, không có thì là đơn mua. */
export function findSupplierReturns(
  tx: DbTransaction,
  purchaseOrderIds: string[],
): Promise<TraceStepRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: supplierReturns.id,
      step: toStep(TraceStep.SUPPLIER_RETURN),
      code: supplierReturns.code,
      status: asText(supplierReturns.status),
      dueDate: NO_TEXT,
      quantity: asNumber(supplierReturns.quantity),
      parentCode: sql<
        string | null
      >`coalesce(${qualityInspections.inspectionNo}, ${purchaseOrders.code})`,
      note: sql<string | null>`${supplierReturns.itemCode}`,
    })
    .from(supplierReturns)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.id, supplierReturns.purchaseOrderId),
    )
    .leftJoin(
      qualityInspections,
      eq(qualityInspections.id, supplierReturns.qualityInspectionId),
    )
    .where(inArray(supplierReturns.purchaseOrderId, purchaseOrderIds))
    .orderBy(asc(supplierReturns.code))
    .limit(TRACE_STEP_LIMIT);
}

export function findPaymentRequests(
  tx: DbTransaction,
  purchaseOrderIds: string[],
): Promise<TraceStepRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: paymentRequests.id,
      step: toStep(TraceStep.PAYMENT_REQUEST),
      code: paymentRequests.code,
      status: asText(paymentRequests.status),
      dueDate: asText(paymentRequests.dueDate),
      quantity: NO_NUMBER,
      parentCode: sql<string | null>`${purchaseOrders.code}`,
      note: sql<
        string | null
      >`'value ' || ${paymentRequests.requestedAmount}::float8`,
    })
    .from(paymentRequests)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.id, paymentRequests.purchaseOrderId),
    )
    .where(inArray(paymentRequests.purchaseOrderId, purchaseOrderIds))
    .orderBy(asc(paymentRequests.code))
    .limit(TRACE_STEP_LIMIT);
}

/** Từ đơn mua đi xuôi: nhập kho, kiểm IQC, trả nhà cung cấp, đề nghị thanh toán. */
export async function findPurchaseDownstream(
  tx: DbTransaction,
  purchaseOrderIds: string[],
): Promise<TraceStepRow[]> {
  const receiptSteps = await findReceipts(tx, purchaseOrderIds);
  const inspectionSteps = await findInspections(tx, purchaseOrderIds);
  const supplierReturnSteps = await findSupplierReturns(tx, purchaseOrderIds);
  const paymentRequestSteps = await findPaymentRequests(tx, purchaseOrderIds);
  return [
    ...receiptSteps,
    ...inspectionSteps,
    ...supplierReturnSteps,
    ...paymentRequestSteps,
  ];
}

export async function findPurchaseRequestIdsByCode(
  tx: DbTransaction,
  code: string,
): Promise<string[]> {
  const matchedRequests = await tx
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.code, code));
  return matchedRequests.map((matchedRequest) => matchedRequest.id);
}

/** Mã có thể là đơn mua, phiếu nhập, phiếu IQC, phiếu trả hoặc đề nghị thanh toán: cả năm đều
 * trỏ về đúng một đơn mua. */
export async function findPurchaseOrderIdsByCode(
  tx: DbTransaction,
  code: string,
): Promise<string[]> {
  const [byOrder, byReceipt, byInspection, byReturn, byPayment] =
    await Promise.all([
      tx
        .select({ purchaseOrderId: purchaseOrders.id })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.code, code)),
      tx
        .select({ purchaseOrderId: inventoryReceipts.purchaseOrderId })
        .from(inventoryReceipts)
        .where(eq(inventoryReceipts.code, code)),
      tx
        .select({ purchaseOrderId: qualityInspections.purchaseOrderId })
        .from(qualityInspections)
        .where(eq(qualityInspections.inspectionNo, code)),
      tx
        .select({ purchaseOrderId: supplierReturns.purchaseOrderId })
        .from(supplierReturns)
        .where(eq(supplierReturns.code, code)),
      tx
        .select({ purchaseOrderId: paymentRequests.purchaseOrderId })
        .from(paymentRequests)
        .where(eq(paymentRequests.code, code)),
    ]);

  const purchaseOrderIds = [
    ...byOrder,
    ...byReceipt,
    ...byInspection,
    ...byReturn,
    ...byPayment,
  ].map((match) => match.purchaseOrderId);
  return [...new Set(purchaseOrderIds)].filter(
    (purchaseOrderId): purchaseOrderId is string => purchaseOrderId !== null,
  );
}
