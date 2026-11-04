import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { asNumber, asText, TODAY } from '../../common/summary/summary.sql';
import type { DbTransaction } from '../../database/database.type';
import {
  clients,
  items,
  orders,
  outsourcingOrderItems,
  outsourcingOrders,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  productionOrders,
  qualityInspections,
  QualityInspectionType,
  suppliers,
} from '../../database/schemas';
import { TRACE_STEP_LIMIT, TraceStep } from './traces.constant';
import { NO_NUMBER, NO_TEXT, toStep } from './traces.shared.query';
import type { TraceStepRow } from './traces.shared.query';

export function findOrderByCode(
  tx: DbTransaction,
  orderCode: string,
): Promise<TraceStepRow[]> {
  return tx
    .select({
      id: orders.id,
      step: toStep(TraceStep.ORDER),
      code: orders.code,
      status: asText(orders.status),
      dueDate: asText(orders.dueDate),
      quantity: NO_NUMBER,
      parentCode: NO_TEXT,
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
): Promise<TraceStepRow[]> {
  if (orderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: productionOrders.id,
      step: toStep(TraceStep.PRODUCTION_ORDER),
      code: productionOrders.code,
      status: asText(productionOrders.status),
      dueDate: NO_TEXT,
      quantity: NO_NUMBER,
      parentCode: sql<string | null>`${orders.code}`,
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
): Promise<TraceStepRow[]> {
  if (productionOrderIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: productionJobs.id,
      step: toStep(TraceStep.JOB),
      code: productionJobs.code,
      status: asText(productionJobs.status),
      dueDate: NO_TEXT,
      quantity: asNumber(productionJobs.quantity),
      parentCode: sql<string | null>`${productionOrders.code}`,
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

/** Phiếu kiểm xuất (OQC) của job; `parentCode` là mã job được kiểm. */
export function findJobInspections(
  tx: DbTransaction,
  jobIds: string[],
): Promise<TraceStepRow[]> {
  if (jobIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: qualityInspections.id,
      step: toStep(TraceStep.OQC),
      code: qualityInspections.inspectionNo,
      status: asText(qualityInspections.status),
      dueDate: NO_TEXT,
      quantity: asNumber(qualityInspections.quantity),
      parentCode: sql<string | null>`${productionJobs.code}`,
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
        eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
      ),
    )
    .orderBy(asc(qualityInspections.inspectionNo))
    .limit(TRACE_STEP_LIMIT);
}

/** Công đoạn chưa làm đủ số lượng của job chưa xong; `status` là LATE khi đã quá hạn. */
export function findUnfinishedOperations(
  tx: DbTransaction,
  jobIds: string[],
): Promise<TraceStepRow[]> {
  if (jobIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: productionJobOperations.id,
      step: toStep(TraceStep.OPERATION),
      code: productionJobOperations.code,
      status: sql<
        string | null
      >`case when ${productionJobOperations.dueDate} < ${TODAY} then 'LATE' else 'OPEN' end`,
      dueDate: asText(productionJobOperations.dueDate),
      quantity: asNumber(productionJobOperations.completedQuantity),
      parentCode: sql<string | null>`${productionJobs.code}`,
      note: sql<
        string | null
      >`${productionJobOperations.name} || ' (' || ${productionJobOperations.type}::text || ') ' || ${productionJobOperations.completedQuantity}::float8 || '/' || ${productionJobs.quantity}::float8`,
    })
    .from(productionJobOperations)
    .innerJoin(
      productionJobs,
      eq(productionJobs.id, productionJobOperations.productionJobId),
    )
    .where(
      and(
        inArray(productionJobOperations.productionJobId, jobIds),
        sql`${productionJobOperations.completedQuantity} < ${productionJobs.quantity}`,
        ne(productionJobs.status, ProductionJobStatus.COMPLETED),
      ),
    )
    .orderBy(asc(productionJobOperations.dueDate))
    .limit(TRACE_STEP_LIMIT);
}

export function findOutsourcingOrdersOfJobs(
  tx: DbTransaction,
  jobIds: string[],
): Promise<TraceStepRow[]> {
  if (jobIds.length === 0) {
    return Promise.resolve([]);
  }
  return tx
    .select({
      id: outsourcingOrders.id,
      step: toStep(TraceStep.OUTSOURCING_ORDER),
      code: outsourcingOrders.code,
      status: asText(outsourcingOrders.status),
      dueDate: asText(outsourcingOrders.expectedReturnDate),
      quantity: asNumber(sql`sum(${outsourcingOrderItems.quantity})`),
      parentCode: sql<string | null>`${productionJobs.code}`,
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
