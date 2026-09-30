import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  clients,
  inventoryBalances,
  items,
  outboundOrders,
  OutboundOrderStatus,
  productionJobOperations,
  productionJobs,
  productionOrders,
  purchaseOrders,
  PurchaseOrderStatus,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { ReportsService } from '../reports/reports.service';
import {
  JobOperationProgressItemDto,
  TrackJobResDto,
} from './dto/track-job.res.dto';

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reportsService: ReportsService,
  ) {}

  /**
   * 1. Cảnh báo nóng điều hành nhà máy (Job trễ, OS trễ, NCR chưa xử lý, DO sắp giao)
   */
  async getFactoryAlertsSummary() {
    this.logger.log('[AI Tool Audit] Fetching factory alerts summary');
    return this.reportsService.getAlerts();
  }

  /**
   * 2. Báo cáo tiến độ sản xuất tổng thể
   */
  async getProductionOverview(startDate?: Date, endDate?: Date) {
    this.logger.log(
      `[AI Tool Audit] Fetching production overview (range: ${startDate?.toISOString() ?? 'all'} to ${endDate?.toISOString() ?? 'all'})`,
    );
    return this.reportsService.getProductionProgress({
      startDate,
      endDate,
    });
  }

  /**
   * 3. Top các lệnh sản xuất (Job) đang trễ hạn nhất
   */
  async getDelayedJobs() {
    this.logger.log('[AI Tool Audit] Fetching delayed jobs list');
    return this.reportsService.getJobDueDate();
  }

  /**
   * 4. Báo cáo chất lượng (Tỷ lệ đạt IQC & OQC)
   */
  async getQcSummary() {
    this.logger.log('[AI Tool Audit] Fetching QC summary metrics');
    return this.reportsService.getQcPassRate();
  }

  /**
   * 5. Danh sách sự cố không phù hợp (NCR) chưa giải quyết
   */
  async getOpenNcr() {
    this.logger.log('[AI Tool Audit] Fetching open NCR issues');
    return this.reportsService.getOpenNcr();
  }

  /**
   * 6. Danh sách các đơn gia công ngoài (OS) trễ hạn giao trả
   */
  async getOutsourcingDelayed() {
    this.logger.log('[AI Tool Audit] Fetching delayed outsourcing orders');
    return this.reportsService.getOutsourcingOrderDueDate();
  }

  /**
   * 7. Tra cứu chi tiết tiến độ theo mã Lệnh sản xuất hoặc Đơn hàng
   */
  async trackJobOrOrder(code: string): Promise<TrackJobResDto> {
    const trimmedCode = code.trim();
    const job = await this.findJobByCodeOrOrderCode(trimmedCode);

    if (!job) {
      // 3. Nếu không phải Job/Order, kiểm tra xem có phải Đơn Mua Hàng (PO) không
      const poList = await this.db
        .select({
          ...getTableColumns(purchaseOrders),
          supplier: getTableColumns(suppliers),
        })
        .from(purchaseOrders)
        .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .where(ilike(purchaseOrders.code, trimmedCode))
        .limit(1);

      if (poList.length > 0) {
        const p = poList[0];
        return {
          found: true,
          orderType: 'PURCHASE_ORDER',
          orderTypeName: 'Đơn Mua Hàng (PO - Vật Tư Từ Nhà Cung Cấp)',
          code: p.code,
          supplierName: p.supplier?.name ?? 'N/A',
          status: p.status,
          orderDate: p.orderDate,
          expectedDate: p.expectedDate,
          note: p.note,
        } as any;
      }

      // 4. Kiểm tra xem có phải Đơn Giao Hàng / Xuất Hàng (DO) không
      const doList = await this.db
        .select({
          ...getTableColumns(outboundOrders),
          client: getTableColumns(clients),
        })
        .from(outboundOrders)
        .leftJoin(clients, eq(outboundOrders.clientId, clients.id))
        .where(ilike(outboundOrders.code, trimmedCode))
        .limit(1);

      if (doList.length > 0) {
        const d = doList[0];
        return {
          found: true,
          orderType: 'DELIVERY_ORDER',
          orderTypeName: 'Đơn Giao Hàng (DO - Xuất Hàng Cho Khách Hàng)',
          code: d.code,
          clientName: d.client?.name ?? 'N/A',
          status: d.status,
          fulfillmentDate: d.fulfillmentDate,
          receiverName: d.receiverName,
          receiverPhone: d.receiverPhone,
          deliveryAddress: d.deliveryAddress,
        } as any;
      }

      this.logger.warn(`[AI Tool Audit] Order not found for code: "${trimmedCode}"`);
      return {
        found: false,
        jobCode: trimmedCode,
        message: `Không tìm thấy Đơn hàng, Đơn mua hàng (PO) hay Đơn giao hàng (DO) có mã "${trimmedCode}". Vui lòng kiểm tra lại mã số.`,
      } as any;
    }

    const ops = await this.db
      .select({
        ...getTableColumns(productionJobOperations),
      })
      .from(productionJobOperations)
      .where(eq(productionJobOperations.productionJobId, job.id))
      .orderBy(productionJobOperations.sortOrder);

    let completedSteps = 0;
    const operationsList: JobOperationProgressItemDto[] = ops.map((op, idx) => {
      const isCompleted = op.completedDate !== null;
      if (isCompleted) completedSteps++;

      return {
        stepIndex: op.sortOrder ?? idx + 1,
        operationName: op.name,
        status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
        completedQuantity: op.completedQuantity ? Number(op.completedQuantity) : 0,
        defectQuantity: op.rejectedQuantity ? Number(op.rejectedQuantity) : 0,
        isOutsourcing: op.type === 'OUTSOURCE',
      };
    });

    const progressPercentage =
      ops.length > 0 ? Math.round((completedSteps / ops.length) * 100) : 0;
    const orderDueDate = job.productionOrder?.order?.dueDate;

    return plainToInstance(
      TrackJobResDto,
      {
        jobCode: job.code,
        orderCode: job.productionOrder?.code ?? '',
        itemName: job.item?.name ?? '',
        targetQuantity: Number(job.quantity),
        status: job.status,
        dueDate: orderDueDate ? new Date(orderDueDate) : null,
        progressPercentage,
        operations: operationsList,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * 8. Danh sách các đơn mua hàng (PO) đang chờ nhà cung cấp giao
   */
  async getPendingPurchaseOrders() {
    this.logger.log('[AI Tool Audit] Fetching pending purchase orders');
    const rows = await this.db
      .select({
        ...getTableColumns(purchaseOrders),
        supplier: getTableColumns(suppliers),
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(
        inArray(purchaseOrders.status, [
          PurchaseOrderStatus.PENDING_CONFIRMATION,
          PurchaseOrderStatus.ORDERED,
        ]),
      )
      .orderBy(asc(purchaseOrders.expectedDate))
      .limit(10);

    return rows.map((po) => ({
      id: po.id,
      code: po.code,
      supplierName: po.supplier?.name ?? 'N/A',
      status: po.status,
      orderDate: po.orderDate,
      expectedDate: po.expectedDate,
      note: po.note,
    }));
  }

  /**
   * 9. Tra cứu tồn kho nguyên vật liệu và thành phẩm
   */
  async getInventoryStock(itemCode?: string) {
    this.logger.log(
      `[AI Tool Audit] Fetching inventory stock (itemCode: ${itemCode ?? 'all'})`,
    );
    return itemCode ? this.findItemStock(itemCode) : this.getAllStockSummary();
  }

  /**
   * 10. Danh sách các đợt xuất hàng (DO) giao khách sắp đến hạn
   */
  async getUpcomingDeliveries(days: number = 7) {
    this.logger.log(`[AI Tool Audit] Fetching upcoming deliveries (days: ${days})`);
    const rows = await this.db
      .select({
        ...getTableColumns(outboundOrders),
        client: getTableColumns(clients),
      })
      .from(outboundOrders)
      .leftJoin(clients, eq(outboundOrders.clientId, clients.id))
      .where(
        and(
          inArray(outboundOrders.status, [
            OutboundOrderStatus.PENDING_APPROVAL,
            OutboundOrderStatus.PENDING_DELIVERY,
          ]),
          lte(
            outboundOrders.fulfillmentDate,
            sql`(now() at time zone 'Asia/Ho_Chi_Minh')::date + ${days}::int`,
          ),
        ),
      )
      .orderBy(asc(outboundOrders.fulfillmentDate))
      .limit(10);

    return rows.map((d) => ({
      id: d.id,
      code: d.code,
      clientName: d.client?.name ?? 'N/A',
      fulfillmentDate: d.fulfillmentDate,
      status: d.status,
      receiverName: d.receiverName,
      receiverPhone: d.receiverPhone,
      deliveryAddress: d.deliveryAddress,
    }));
  }

  /**
   * 11. Top công đoạn đang có nhiều việc / ứ đọng nhất trong xưởng (Điểm nghẽn WIP)
   */
  async getOperationBottlenecks() {
    this.logger.log('[AI Tool Audit] Fetching operation bottlenecks (WIP)');
    const rows = await this.db
      .select({
        operationName: productionJobOperations.name,
        waitingCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(productionJobOperations)
      .where(isNull(productionJobOperations.completedDate))
      .groupBy(productionJobOperations.name)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    return rows.map((r, idx) => ({
      rank: idx + 1,
      operationName: r.operationName,
      inProgressJobsCount: r.waitingCount,
      bottleneckLevel: this.resolveBottleneckLevel(r.waitingCount),
    }));
  }

  // -------------------------------------------------------------
  // Helper Methods (Tách hàm để code trực quan, gọn đẹp, dễ đọc)
  // -------------------------------------------------------------

  private async findJobByCodeOrOrderCode(code: string) {
    // 1. Tìm trực tiếp theo mã Lệnh sản xuất (Job)
    const job = await this.db.query.productionJobs.findFirst({
      where: ilike(productionJobs.code, code),
      with: {
        productionOrder: { with: { order: true } },
        item: true,
      },
    });
    if (job) return job;

    // 2. Tìm theo mã Đơn sản xuất (Production Order)
    const order = await this.db.query.productionOrders.findFirst({
      where: ilike(productionOrders.code, code),
    });
    if (!order) return null;

    return this.db.query.productionJobs.findFirst({
      where: eq(productionJobs.productionOrderId, order.id),
      with: {
        productionOrder: { with: { order: true } },
        item: true,
      },
    });
  }

  private async findItemStock(itemCode: string) {
    const trimmed = itemCode.trim();
    const rows = await this.db
      .select({
        ...getTableColumns(inventoryBalances),
        item: getTableColumns(items),
      })
      .from(inventoryBalances)
      .innerJoin(items, eq(inventoryBalances.itemId, items.id))
      .where(ilike(items.code, `%${trimmed}%`))
      .limit(1);

    if (!rows.length) {
      return {
        found: false,
        itemCode: trimmed,
        message: `Không tìm thấy thông tin tồn kho cho mặt hàng có mã "${trimmed}".`,
      };
    }

    const b = rows[0];
    return {
      found: true,
      itemCode: b.item.code,
      itemName: b.item.name,
      quantity: Number(b.quantity),
      updatedAt: b.updatedAt,
    };
  }

  private async getAllStockSummary() {
    const rows = await this.db
      .select({
        ...getTableColumns(inventoryBalances),
        item: getTableColumns(items),
      })
      .from(inventoryBalances)
      .innerJoin(items, eq(inventoryBalances.itemId, items.id))
      .limit(15);

    return rows.map((b) => ({
      itemCode: b.item.code,
      itemName: b.item.name,
      quantity: Number(b.quantity),
      updatedAt: b.updatedAt,
    }));
  }

  private resolveBottleneckLevel(count: number): 'CAO' | 'TRUNG BÌNH' | 'THẤP' {
    if (count >= 5) return 'CAO';
    if (count >= 2) return 'TRUNG BÌNH';
    return 'THẤP';
  }
}
