import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import { purchaseOrders, purchaseRequests } from '../../database/schemas';
import {
  findBomOperations,
  findBomTree,
  findItemsByCode,
  findProductsUsingItems,
  openPurchaseOrderIdsOfItems,
  openPurchaseRequestIdsOfItems,
} from './traces.item.query';
import {
  findJobInspections,
  findJobs,
  findOrderByCode,
  findOutsourcingOrdersOfJobs,
  findProductionOrders,
  findUnfinishedOperations,
} from './traces.order.query';
import {
  findPurchaseDownstream,
  findPurchaseOrderIdsByCode,
  findPurchaseOrders,
  findPurchaseOrdersOfRequests,
  findPurchaseRequestIdsByCode,
  findPurchaseRequests,
  findPurchaseRequestsOfJobs,
  findPurchaseRequestsOfOrders,
} from './traces.purchase.query';
import { toStepIds, toStepNodes } from './traces.shared.query';
import type { TraceStepNode } from './traces.shared.query';
import {
  findOpenOutsourcingOrders,
  findOrdersWaitingOnPurchaseOrders,
  findPendingSupplierReturns,
  findRecentFailedInspections,
  findSuppliersByKeyword,
  openPurchaseOrdersOf,
} from './traces.supplier.query';

@Injectable()
export class TracesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  traceOrder(orderCode: string): Promise<TraceStepNode[]> {
    return this.readSnapshot((tx) => this.collectOrderTrace(tx, orderCode));
  }

  tracePurchase(code: string): Promise<TraceStepNode[]> {
    return this.readSnapshot((tx) => this.collectPurchaseTrace(tx, code));
  }

  traceSupplier(keyword: string): Promise<TraceStepNode[]> {
    return this.readSnapshot((tx) => this.collectSupplierTrace(tx, keyword));
  }

  traceItemSupply(itemCode: string): Promise<TraceStepNode[]> {
    return this.readSnapshot((tx) => this.collectItemSupplyTrace(tx, itemCode));
  }

  traceItemStructure(itemCode: string): Promise<TraceStepNode[]> {
    return this.readSnapshot((tx) =>
      this.collectItemStructureTrace(tx, itemCode),
    );
  }

  // Truy vết đi qua nhiều truy vấn nối tiếp nhau: một ảnh chụp nhất quán để các bước không lệch
  // nhau nếu chứng từ đổi giữa chừng, và chỉ đọc để không thể ghi nhầm
  private readSnapshot<T>(
    collect: (tx: DbTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(collect, {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  }

  /** Đơn bán → lệnh sản xuất → job → công đoạn chưa xong, OQC và gia công ngoài → đề nghị mua thiếu
   * vật tư → đơn mua → nhập kho, IQC, trả hàng, thanh toán. */
  private async collectOrderTrace(
    tx: DbTransaction,
    orderCode: string,
  ): Promise<TraceStepNode[]> {
    const orderSteps = await findOrderByCode(tx, orderCode);
    const productionOrderSteps = await findProductionOrders(
      tx,
      toStepIds(orderSteps),
    );
    const productionOrderIds = toStepIds(productionOrderSteps);
    const jobSteps = await findJobs(tx, productionOrderIds);
    const jobIds = toStepIds(jobSteps);
    const operationSteps = await findUnfinishedOperations(tx, jobIds);
    const jobInspectionSteps = await findJobInspections(tx, jobIds);
    const outsourcingSteps = await findOutsourcingOrdersOfJobs(tx, jobIds);
    const requestSteps = await findPurchaseRequestsOfJobs(
      tx,
      jobIds,
      productionOrderIds,
    );
    const purchaseOrderSteps = await findPurchaseOrdersOfRequests(
      tx,
      toStepIds(requestSteps),
    );
    const downstreamSteps = await findPurchaseDownstream(
      tx,
      toStepIds(purchaseOrderSteps),
    );

    return toStepNodes([
      ...orderSteps,
      ...productionOrderSteps,
      ...jobSteps,
      ...operationSteps,
      ...jobInspectionSteps,
      ...outsourcingSteps,
      ...requestSteps,
      ...purchaseOrderSteps,
      ...downstreamSteps,
    ]);
  }

  /** Từ bất kỳ chứng từ mua hàng đi cả hai chiều: đề nghị mua ở trên, đơn mua và các chứng từ
   * nhập kho, IQC, trả hàng, thanh toán ở dưới. */
  private async collectPurchaseTrace(
    tx: DbTransaction,
    code: string,
  ): Promise<TraceStepNode[]> {
    const requestIds = await findPurchaseRequestIdsByCode(tx, code);
    if (requestIds.length > 0) {
      return this.collectTraceFromRequests(tx, requestIds);
    }
    const purchaseOrderIds = await findPurchaseOrderIdsByCode(tx, code);
    return this.collectTraceFromPurchaseOrders(tx, purchaseOrderIds);
  }

  private async collectTraceFromRequests(
    tx: DbTransaction,
    requestIds: string[],
  ): Promise<TraceStepNode[]> {
    const requestSteps = await findPurchaseRequests(
      tx,
      inArray(purchaseRequests.id, requestIds),
    );
    const purchaseOrderSteps = await findPurchaseOrdersOfRequests(
      tx,
      requestIds,
    );
    const downstreamSteps = await findPurchaseDownstream(
      tx,
      toStepIds(purchaseOrderSteps),
    );
    return toStepNodes([
      ...requestSteps,
      ...purchaseOrderSteps,
      ...downstreamSteps,
    ]);
  }

  private async collectTraceFromPurchaseOrders(
    tx: DbTransaction,
    purchaseOrderIds: string[],
  ): Promise<TraceStepNode[]> {
    const requestSteps = await findPurchaseRequestsOfOrders(
      tx,
      purchaseOrderIds,
    );
    const purchaseOrderSteps =
      purchaseOrderIds.length === 0
        ? []
        : await findPurchaseOrders(
            tx,
            inArray(purchaseOrders.id, purchaseOrderIds),
          );
    const downstreamSteps = await findPurchaseDownstream(tx, purchaseOrderIds);
    return toStepNodes([
      ...requestSteps,
      ...purchaseOrderSteps,
      ...downstreamSteps,
    ]);
  }

  /** Nhà cung cấp → đơn mua còn mở, IQC không đạt gần đây, phiếu trả chưa xuất, gia công ngoài còn
   * mở → các đơn bán đang chờ vật tư từ những đơn mua đó. */
  private async collectSupplierTrace(
    tx: DbTransaction,
    keyword: string,
  ): Promise<TraceStepNode[]> {
    const supplierSteps = await findSuppliersByKeyword(tx, keyword);
    if (supplierSteps.length === 0) {
      return [];
    }
    const supplierIds = toStepIds(supplierSteps);
    const purchaseOrderSteps = await findPurchaseOrders(
      tx,
      openPurchaseOrdersOf(supplierIds),
    );
    const inspectionSteps = await findRecentFailedInspections(tx, supplierIds);
    const returnSteps = await findPendingSupplierReturns(tx, supplierIds);
    const outsourcingSteps = await findOpenOutsourcingOrders(tx, supplierIds);
    const affectedOrderSteps = await findOrdersWaitingOnPurchaseOrders(
      tx,
      toStepIds(purchaseOrderSteps),
    );

    return toStepNodes([
      ...supplierSteps,
      ...purchaseOrderSteps,
      ...inspectionSteps,
      ...returnSteps,
      ...outsourcingSteps,
      ...affectedOrderSteps,
    ]);
  }

  /** Vật tư → sản phẩm dùng nó trong BOM → đề nghị mua và đơn mua còn mở (kèm nhà cung cấp). */
  private async collectItemSupplyTrace(
    tx: DbTransaction,
    itemCode: string,
  ): Promise<TraceStepNode[]> {
    const itemSteps = await findItemsByCode(tx, itemCode);
    if (itemSteps.length === 0) {
      return [];
    }
    const itemIds = toStepIds(itemSteps);
    const productSteps = await findProductsUsingItems(tx, itemIds);
    const requestSteps = await findPurchaseRequests(
      tx,
      inArray(purchaseRequests.id, openPurchaseRequestIdsOfItems(tx, itemIds)),
    );
    const purchaseOrderSteps = await findPurchaseOrders(
      tx,
      inArray(purchaseOrders.id, openPurchaseOrderIdsOfItems(tx, itemIds)),
    );
    return toStepNodes([
      ...itemSteps,
      ...productSteps,
      ...requestSteps,
      ...purchaseOrderSteps,
    ]);
  }

  /** Sản phẩm → cây BOM và công đoạn của từng nút. */
  private async collectItemStructureTrace(
    tx: DbTransaction,
    itemCode: string,
  ): Promise<TraceStepNode[]> {
    const itemSteps = await findItemsByCode(tx, itemCode);
    if (itemSteps.length === 0) {
      return [];
    }
    const itemIds = toStepIds(itemSteps);
    const bomSteps = await findBomTree(tx, itemIds);
    const operationSteps = await findBomOperations(tx, itemIds);
    return toStepNodes([...itemSteps, ...bomSteps, ...operationSteps]);
  }
}
