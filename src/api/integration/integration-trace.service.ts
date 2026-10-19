import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { DbTransaction } from '../../database/database.type';
import {
  clients,
  inventoryReceipts,
  orders,
  paymentRequests,
  productionJobs,
  productionOrders,
  purchaseOrders,
  purchaseRequests,
  qualityInspections,
  supplierReturns,
} from '../../database/schemas';

import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  TraceItemReqDto,
  TraceItemView,
  TraceOrderReqDto,
  TracePurchaseReqDto,
  TraceSupplierReqDto,
} from './dto/integration-trace.req.dto';
import {
  equalsText,
  inTexts,
  IntegrationQueryService,
} from './integration-query.service';
import {
  findJobInspections,
  findJobs,
  findOrderByCode,
  findOutsourcingOrdersOfJobs,
  findProductionOrders,
  findPurchaseDownstream,
  findPurchaseOrders,
  findPurchaseOrdersOfRequests,
  findPurchaseRequests,
  findPurchaseRequestsOfJobs,
  findPurchaseRequestsOfOrders,
  findUnfinishedOperations,
  toIds,
  toNodes,
  TRACE_COLUMNS,
} from './integration-trace.queries';
import type { TraceNode } from './integration-trace.queries';
import {
  findBomOperations,
  findBomTree,
  findItemsByCode,
  findProductsUsingItems,
  openPurchaseOrderIdsOfItems,
  openPurchaseRequestIdsOfItems,
} from './integration-trace-item.queries';
import {
  findOpenOutsourcingOrders,
  findOrdersWaitingOnPurchaseOrders,
  findPendingSupplierReturns,
  findRecentFailedInspections,
  findSuppliersByKeyword,
  openPurchaseOrdersOf,
} from './integration-trace-supplier.queries';

const DEFAULT_PROGRESS_STATUSES = ['AWAITING_PRODUCTION', 'IN_PROGRESS'];
const DEFAULT_LIST_LIMIT = 20;

@Injectable()
export class IntegrationTraceService {
  constructor(private readonly queryService: IntegrationQueryService) {}

  traceOrder(reqDto: TraceOrderReqDto): Promise<IntegrationResultResDto> {
    const { orderCode } = reqDto;
    if (!orderCode) {
      return this.listOrderProgress(reqDto);
    }
    return this.queryService.query('trace_order', TRACE_COLUMNS, (tx) =>
      this.collectOrderTrace(tx, orderCode),
    );
  }

  tracePurchase(reqDto: TracePurchaseReqDto): Promise<IntegrationResultResDto> {
    return this.queryService.query('trace_purchase', TRACE_COLUMNS, (tx) =>
      this.collectPurchaseTrace(tx, reqDto.code),
    );
  }

  traceSupplier(reqDto: TraceSupplierReqDto): Promise<IntegrationResultResDto> {
    return this.queryService.query('trace_supplier', TRACE_COLUMNS, (tx) =>
      this.collectSupplierTrace(tx, reqDto.supplier),
    );
  }

  traceItem(reqDto: TraceItemReqDto): Promise<IntegrationResultResDto> {
    return this.queryService.query('trace_item', TRACE_COLUMNS, (tx) =>
      this.collectItemTrace(tx, reqDto),
    );
  }

  /** `supply`: vật tư → sản phẩm dùng nó trong BOM → đề nghị mua và đơn mua còn mở (kèm nhà cung
   * cấp). `structure`: sản phẩm → cây BOM và công đoạn của từng nút. */
  private async collectItemTrace(
    tx: DbTransaction,
    reqDto: TraceItemReqDto,
  ): Promise<TraceNode[]> {
    const itemRows = await findItemsByCode(tx, reqDto.itemCode);
    const itemIds = toIds(itemRows);
    if (itemIds.length === 0) {
      return [];
    }

    if (reqDto.view === TraceItemView.STRUCTURE) {
      const bomRows = await findBomTree(tx, itemIds);
      const operationRows = await findBomOperations(tx, itemIds);
      return toNodes([...itemRows, ...bomRows, ...operationRows]);
    }

    const productRows = await findProductsUsingItems(tx, itemIds);
    const requestRows = await findPurchaseRequests(
      tx,
      inArray(purchaseRequests.id, openPurchaseRequestIdsOfItems(tx, itemIds)),
    );
    const purchaseOrderRows = await findPurchaseOrders(
      tx,
      inArray(purchaseOrders.id, openPurchaseOrderIdsOfItems(tx, itemIds)),
    );
    return toNodes([
      ...itemRows,
      ...productRows,
      ...requestRows,
      ...purchaseOrderRows,
    ]);
  }

  /** Nhà cung cấp → đơn mua còn mở, IQC không đạt gần đây, phiếu trả chưa xuất, gia công ngoài còn
   * mở → các đơn bán đang chờ vật tư từ những đơn mua đó. */
  private async collectSupplierTrace(
    tx: DbTransaction,
    keyword: string,
  ): Promise<TraceNode[]> {
    const supplierRows = await findSuppliersByKeyword(tx, keyword);
    if (supplierRows.length === 0) {
      return [];
    }
    const supplierIds = toIds(supplierRows);
    const purchaseOrderRows = await findPurchaseOrders(
      tx,
      openPurchaseOrdersOf(supplierIds),
    );
    const inspectionRows = await findRecentFailedInspections(tx, supplierIds);
    const returnRows = await findPendingSupplierReturns(tx, supplierIds);
    const outsourcingRows = await findOpenOutsourcingOrders(tx, supplierIds);
    const affectedOrderRows = await findOrdersWaitingOnPurchaseOrders(
      tx,
      toIds(purchaseOrderRows),
    );

    return toNodes([
      ...supplierRows,
      ...purchaseOrderRows,
      ...inspectionRows,
      ...returnRows,
      ...outsourcingRows,
      ...affectedOrderRows,
    ]);
  }

  /** Đơn bán → lệnh sản xuất → job → công đoạn chưa xong, OQC và gia công ngoài → đề nghị mua thiếu
   * vật tư → đơn mua → nhập kho, IQC, trả hàng, thanh toán. */
  private async collectOrderTrace(
    tx: DbTransaction,
    orderCode: string,
  ): Promise<TraceNode[]> {
    const orderRows = await findOrderByCode(tx, orderCode);
    const productionOrderRows = await findProductionOrders(
      tx,
      toIds(orderRows),
    );
    const jobRows = await findJobs(tx, toIds(productionOrderRows));
    const jobIds = toIds(jobRows);
    const operationRows = await findUnfinishedOperations(tx, jobIds);
    const jobInspectionRows = await findJobInspections(tx, jobIds);
    const outsourcingRows = await findOutsourcingOrdersOfJobs(tx, jobIds);
    const requestRows = await findPurchaseRequestsOfJobs(
      tx,
      jobIds,
      toIds(productionOrderRows),
    );
    const purchaseOrderRows = await findPurchaseOrdersOfRequests(
      tx,
      toIds(requestRows),
    );
    const downstreamRows = await findPurchaseDownstream(
      tx,
      toIds(purchaseOrderRows),
    );

    return toNodes([
      ...orderRows,
      ...productionOrderRows,
      ...jobRows,
      ...operationRows,
      ...jobInspectionRows,
      ...outsourcingRows,
      ...requestRows,
      ...purchaseOrderRows,
      ...downstreamRows,
    ]);
  }

  /** Từ bất kỳ chứng từ mua hàng đi cả hai chiều: đề nghị mua ở trên, đơn mua và các chứng từ
   * nhập kho, IQC, trả hàng, thanh toán ở dưới. */
  private async collectPurchaseTrace(
    tx: DbTransaction,
    code: string,
  ): Promise<TraceNode[]> {
    const requestIds = await this.findRequestIdsByCode(tx, code);
    if (requestIds.length > 0) {
      const requestRows = await findPurchaseRequests(
        tx,
        inArray(purchaseRequests.id, requestIds),
      );
      const purchaseOrderRows = await findPurchaseOrdersOfRequests(
        tx,
        requestIds,
      );
      const downstreamRows = await findPurchaseDownstream(
        tx,
        toIds(purchaseOrderRows),
      );
      return toNodes([...requestRows, ...purchaseOrderRows, ...downstreamRows]);
    }

    const purchaseOrderIds = await this.findPurchaseOrderIdsByCode(tx, code);
    const requestRows = await findPurchaseRequestsOfOrders(
      tx,
      purchaseOrderIds,
    );
    const purchaseOrderRows =
      purchaseOrderIds.length === 0
        ? []
        : await findPurchaseOrders(
            tx,
            inArray(purchaseOrders.id, purchaseOrderIds),
          );
    const downstreamRows = await findPurchaseDownstream(tx, purchaseOrderIds);
    return toNodes([...requestRows, ...purchaseOrderRows, ...downstreamRows]);
  }

  private async findRequestIdsByCode(
    tx: DbTransaction,
    code: string,
  ): Promise<string[]> {
    const matches = await tx
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.code, code));
    return matches.map((match) => match.id);
  }

  /** Mã có thể là đơn mua, phiếu nhập, phiếu IQC, phiếu trả hoặc đề nghị thanh toán: cả năm đều
   * trỏ về đúng một đơn mua. */
  private async findPurchaseOrderIdsByCode(
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

  /** Không có mã đơn: tiến độ số job xong trên tổng job của các đơn đang chạy. */
  private listOrderProgress(
    reqDto: TraceOrderReqDto,
  ): Promise<IntegrationResultResDto> {
    const statusFilter = reqDto.status
      ? equalsText(orders.status, reqDto.status)
      : inTexts(orders.status, DEFAULT_PROGRESS_STATUSES);
    return this.queryService.query(
      'trace_order',
      [
        'don_hang',
        'khach_hang',
        'status',
        'due_date',
        'so_cong_viec',
        'so_cong_viec_xong',
      ],
      (tx) =>
        tx
          .select({
            don_hang: orders.code,
            khach_hang: clients.name,
            status: sql<string>`${orders.status}::text`,
            due_date: sql<string>`${orders.dueDate}::text`,
            so_cong_viec: sql<number>`count(${productionJobs.id})::int`,
            so_cong_viec_xong: sql<number>`count(*) filter (where ${productionJobs.status}::text = 'COMPLETED')::int`,
          })
          .from(orders)
          .innerJoin(clients, eq(clients.id, orders.clientId))
          .leftJoin(
            productionOrders,
            and(
              eq(productionOrders.orderId, orders.id),
              equalsText(productionOrders.sourceType, 'ORDER'),
            ),
          )
          .leftJoin(
            productionJobs,
            eq(productionJobs.productionOrderId, productionOrders.id),
          )
          .where(and(isNull(orders.deletedAt), statusFilter))
          .groupBy(orders.code, clients.name, orders.status, orders.dueDate)
          .orderBy(asc(orders.dueDate))
          .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT),
    );
  }
}
