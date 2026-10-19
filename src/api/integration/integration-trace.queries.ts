import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';

import type { DbTransaction } from '../../database/database.type';
import {
  clients,
  inventoryReceiptItems,
  inventoryReceipts,
  items,
  orders,
  outsourcingOrderItems,
  outsourcingOrders,
  paymentRequests,
  productionJobOperations,
  productionJobs,
  productionOrders,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  qualityInspections,
  supplierReturns,
  suppliers,
} from '../../database/schemas';
import { equalsText, TODAY } from './integration-query.service';

/** Loại chứng từ ở mỗi bước truy vết, cột `step` của bảng kết quả. */
export enum TraceStep {
  ORDER = 'order',
  PRODUCTION_ORDER = 'production_order',
  JOB = 'job',
  OPERATION = 'operation',
  OUTSOURCING_ORDER = 'outsourcing_order',
  PURCHASE_REQUEST = 'purchase_request',
  PURCHASE_ORDER = 'purchase_order',
  RECEIPT = 'receipt',
  IQC = 'iqc',
  OQC = 'oqc',
  SUPPLIER_RETURN = 'supplier_return',
  PAYMENT_REQUEST = 'payment_request',
  SUPPLIER = 'supplier',
  BOM = 'bom',
  ITEM = 'item',
  STOCK = 'stock',
}

/** Một chứng từ trên đường truy vết; `parent_code` là mã chứng từ cha mà nó nối vào. */
export type TraceNode = {
  step: TraceStep;
  code: string | null;
  status: string | null;
  due_date: string | null;
  quantity: number | null;
  parent_code: string | null;
  note: string | null;
};

// `id` để bước sau tra tiếp, không trả ra ngoài
export type TraceRow = TraceNode & { id: string };

export const TRACE_COLUMNS: Array<keyof TraceNode> = [
  'step',
  'code',
  'status',
  'due_date',
  'quantity',
  'parent_code',
  'note',
];

// Mỗi bước tối đa ngần này dòng để một đơn lớn không làm tràn bảng kết quả
export const TRACE_STEP_LIMIT = 50;

export const NO_TEXT = sql<string | null>`null::text`;
export const NO_NUMBER = sql<number | null>`null::float8`;

// Giá trị lấy từ enum trong code, không từ request, nên chèn thẳng được
export const toStep = (value: TraceStep) =>
  sql<TraceStep>`${sql.raw(`'${value}'`)}`;
export const asText = (column: AnyColumn | SQL) =>
  sql<string | null>`${column}::text`;
export const asNumber = (column: AnyColumn | SQL) =>
  sql<number | null>`${column}::float8`;

/** Tổng số lượng chỉ có nghĩa khi chứng từ có một mặt hàng; nhiều mặt hàng khác đơn vị thì bỏ trống. */
export const singleItemQuantity = (quantity: AnyColumn, item: AnyColumn) =>
  sql<
    number | null
  >`case when count(distinct ${item}) = 1 then sum(${quantity})::float8 end`;

export function toNodes(traceRows: TraceRow[]): TraceNode[] {
  return traceRows.map(({ id: _id, ...node }) => node);
}

export function toIds(traceRows: TraceRow[]): string[] {
  return traceRows.map((traceRow) => traceRow.id);
}

// ---------- Bước từ đơn bán xuống sản xuất ----------

export function findOrderByCode(
  tx: DbTransaction,
  orderCode: string,
): Promise<TraceRow[]> {
  return tx
    .select({
      id: orders.id,
      step: toStep(TraceStep.ORDER),
      code: orders.code,
      status: asText(orders.status),
      due_date: asText(orders.dueDate),
      quantity: NO_NUMBER,
      parent_code: NO_TEXT,
      note: sql<string | null>`${clients.name}`,
    })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(and(eq(orders.code, orderCode), isNull(orders.deletedAt)))
    .limit(1);
}

export function findProductionOrders(
  tx: DbTransaction,
  orderIds: string[],
): Promise<TraceRow[]> {
  if (orderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: productionOrders.id,
      step: toStep(TraceStep.PRODUCTION_ORDER),
      code: productionOrders.code,
      status: asText(productionOrders.status),
      due_date: NO_TEXT,
      quantity: NO_NUMBER,
      parent_code: sql<string | null>`${orders.code}`,
      note: asText(productionOrders.sourceType),
    })
    .from(productionOrders)
    .innerJoin(orders, eq(orders.id, productionOrders.orderId))
    .where(inArray(productionOrders.orderId, orderIds))
    .orderBy(asc(productionOrders.code))
    .limit(TRACE_STEP_LIMIT);
}

export function findJobs(
  tx: DbTransaction,
  productionOrderIds: string[],
): Promise<TraceRow[]> {
  if (productionOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: productionJobs.id,
      step: toStep(TraceStep.JOB),
      code: productionJobs.code,
      status: asText(productionJobs.status),
      due_date: NO_TEXT,
      quantity: asNumber(productionJobs.quantity),
      parent_code: sql<string | null>`${productionOrders.code}`,
      note: sql<string | null>`${items.code}`,
    })
    .from(productionJobs)
    .innerJoin(
      productionOrders,
      eq(productionOrders.id, productionJobs.productionOrderId),
    )
    .innerJoin(items, eq(items.id, productionJobs.itemId))
    .where(inArray(productionJobs.productionOrderId, productionOrderIds))
    .orderBy(asc(productionJobs.code))
    .limit(TRACE_STEP_LIMIT);
}

/** Phiếu kiểm xuất (OQC) của job; `parent_code` là mã job được kiểm. */
export function findJobInspections(
  tx: DbTransaction,
  jobIds: string[],
): Promise<TraceRow[]> {
  if (jobIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: qualityInspections.id,
      step: toStep(TraceStep.OQC),
      code: qualityInspections.inspectionNo,
      status: asText(qualityInspections.status),
      due_date: NO_TEXT,
      quantity: asNumber(qualityInspections.quantity),
      parent_code: sql<string | null>`${productionJobs.code}`,
      note: sql<
        string | null
      >`coalesce(${qualityInspections.decision}::text, '-') || ' / ' || coalesce(${qualityInspections.disposition}::text, '-')`,
    })
    .from(qualityInspections)
    .innerJoin(
      productionJobs,
      eq(productionJobs.id, qualityInspections.productionJobId),
    )
    .where(
      and(
        inArray(qualityInspections.productionJobId, jobIds),
        equalsText(qualityInspections.inspectionType, 'OQC'),
      ),
    )
    .orderBy(asc(qualityInspections.inspectionNo))
    .limit(TRACE_STEP_LIMIT);
}

/** Công đoạn chưa làm đủ số lượng của job chưa xong; `status` là LATE khi đã quá hạn. */
export function findUnfinishedOperations(
  tx: DbTransaction,
  jobIds: string[],
): Promise<TraceRow[]> {
  if (jobIds.length === 0) {
    return Promise.resolve([]);
  }
  const completedQuantity = sql`coalesce(${productionJobOperations.completedQuantity}, 0)`;
  return tx
    .select({
      id: productionJobOperations.id,
      step: toStep(TraceStep.OPERATION),
      code: productionJobOperations.code,
      status: sql<
        string | null
      >`case when ${productionJobOperations.dueDate} < ${TODAY} then 'LATE' else 'OPEN' end`,
      due_date: asText(productionJobOperations.dueDate),
      quantity: asNumber(completedQuantity),
      parent_code: sql<string | null>`${productionJobs.code}`,
      note: sql<
        string | null
      >`${productionJobOperations.name} || ' (' || ${productionJobOperations.type}::text || ') ' || ${completedQuantity}::float8 || '/' || ${productionJobs.quantity}::float8`,
    })
    .from(productionJobOperations)
    .innerJoin(
      productionJobs,
      eq(productionJobs.id, productionJobOperations.productionJobId),
    )
    .where(
      and(
        inArray(productionJobOperations.productionJobId, jobIds),
        sql`${completedQuantity} < ${productionJobs.quantity}`,
        sql`${productionJobs.status}::text <> 'COMPLETED'`,
      ),
    )
    .orderBy(asc(productionJobOperations.dueDate))
    .limit(TRACE_STEP_LIMIT);
}

export function findOutsourcingOrdersOfJobs(
  tx: DbTransaction,
  jobIds: string[],
): Promise<TraceRow[]> {
  if (jobIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: outsourcingOrders.id,
      step: toStep(TraceStep.OUTSOURCING_ORDER),
      code: outsourcingOrders.code,
      status: asText(outsourcingOrders.status),
      due_date: asText(outsourcingOrders.expectedReturnDate),
      quantity: asNumber(sql`sum(${outsourcingOrderItems.quantity})`),
      parent_code: sql<string | null>`${productionJobs.code}`,
      note: sql<string | null>`${suppliers.name}`,
    })
    .from(outsourcingOrderItems)
    .innerJoin(
      outsourcingOrders,
      eq(outsourcingOrders.id, outsourcingOrderItems.outsourcingOrderId),
    )
    .innerJoin(suppliers, eq(suppliers.id, outsourcingOrders.supplierId))
    .innerJoin(
      productionJobs,
      eq(productionJobs.id, outsourcingOrderItems.productionJobId),
    )
    .where(inArray(outsourcingOrderItems.productionJobId, jobIds))
    .groupBy(outsourcingOrders.id, productionJobs.code, suppliers.name)
    .orderBy(asc(outsourcingOrders.code))
    .limit(TRACE_STEP_LIMIT);
}

// ---------- Bước mua hàng ----------

/**
 * Đề nghị mua theo điều kiện `where`. `note` cho biết đơn bán nguồn gốc khi đề nghị thiếu vật
 * tư do job tạo ra; đề nghị tạo tay không có job nên `parent_code` và `note` rỗng.
 */
export function findPurchaseRequests(
  tx: DbTransaction,
  where: SQL | undefined,
): Promise<TraceRow[]> {
  return tx
    .select({
      id: purchaseRequests.id,
      step: toStep(TraceStep.PURCHASE_REQUEST),
      code: purchaseRequests.code,
      status: asText(purchaseRequests.status),
      due_date: asText(purchaseRequests.neededDate),
      quantity: singleItemQuantity(
        purchaseRequestItems.quantity,
        purchaseRequestItems.itemId,
      ),
      parent_code: sql<string | null>`${productionJobs.code}`,
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
): Promise<TraceRow[]> {
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
): Promise<TraceRow[]> {
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

/** Đơn mua theo điều kiện `where`; `parent_code` liệt kê các đề nghị mua đã sinh ra đơn. */
export function findPurchaseOrders(
  tx: DbTransaction,
  where: SQL | undefined,
): Promise<TraceRow[]> {
  return tx
    .select({
      id: purchaseOrders.id,
      step: toStep(TraceStep.PURCHASE_ORDER),
      code: purchaseOrders.code,
      status: asText(purchaseOrders.status),
      due_date: asText(purchaseOrders.expectedDate),
      quantity: singleItemQuantity(
        purchaseOrderItems.quantity,
        purchaseRequestItems.itemId,
      ),
      parent_code: sql<
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
): Promise<TraceRow[]> {
  if (purchaseRequestIds.length === 0) {
    return Promise.resolve([]);
  }
  // Lọc theo đề nghị ở truy vấn con để `parent_code` vẫn liệt kê đủ đề nghị của đơn
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
): Promise<TraceRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: inventoryReceipts.id,
      step: toStep(TraceStep.RECEIPT),
      code: inventoryReceipts.code,
      status: asText(inventoryReceipts.status),
      due_date: NO_TEXT,
      quantity: singleItemQuantity(
        inventoryReceiptItems.quantity,
        inventoryReceiptItems.itemId,
      ),
      parent_code: sql<string | null>`${purchaseOrders.code}`,
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
): Promise<TraceRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
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
        equalsText(qualityInspections.inspectionType, 'IQC'),
      ),
    )
    .orderBy(asc(qualityInspections.inspectionNo))
    .limit(TRACE_STEP_LIMIT);
}

/** Phiếu trả nhà cung cấp; `parent_code` là phiếu kiểm IQC sinh ra nó, không có thì là đơn mua. */
export function findSupplierReturns(
  tx: DbTransaction,
  purchaseOrderIds: string[],
): Promise<TraceRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: supplierReturns.id,
      step: toStep(TraceStep.SUPPLIER_RETURN),
      code: supplierReturns.code,
      status: asText(supplierReturns.status),
      due_date: NO_TEXT,
      quantity: asNumber(supplierReturns.quantity),
      parent_code: sql<
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
): Promise<TraceRow[]> {
  if (purchaseOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: paymentRequests.id,
      step: toStep(TraceStep.PAYMENT_REQUEST),
      code: paymentRequests.code,
      status: asText(paymentRequests.status),
      due_date: asText(paymentRequests.dueDate),
      quantity: NO_NUMBER,
      parent_code: sql<string | null>`${purchaseOrders.code}`,
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
): Promise<TraceRow[]> {
  const receipts = await findReceipts(tx, purchaseOrderIds);
  const inspections = await findInspections(tx, purchaseOrderIds);
  const supplierReturnRows = await findSupplierReturns(tx, purchaseOrderIds);
  const paymentRequestRows = await findPaymentRequests(tx, purchaseOrderIds);
  return [
    ...receipts,
    ...inspections,
    ...supplierReturnRows,
    ...paymentRequestRows,
  ];
}
