import { StockStatus } from '../../inventory/inventory.constant';
import { GetInventoryDirectsReqDto } from '../../inventory-directs/dto/get-inventory-directs.req.dto';
import { InventoryDirectsService } from '../../inventory-directs/inventory-directs.service';
import { PurchaseOrdersService } from '../../purchase-orders/purchase-orders.service';
import { ReportsService } from '../../reports/reports.service';
import { createRequestDto } from '../core/ai-tool.result';
import { findOverduePurchaseOrders } from '../purchase-orders/purchase-orders.queries';
import type { RiskSignals } from './risk.type';

/** Number of example document codes kept per signal. */
const EXAMPLE_COUNT = 3;

export async function collectReportSignals(
  reportsService: ReportsService,
): Promise<RiskSignals> {
  const [stats, alerts, overdueJobs, openNcrs, lateOutsourcing] =
    await Promise.all([
      reportsService.getStats({}),
      reportsService.getAlerts(),
      reportsService.getJobDueDate(),
      reportsService.getOpenNcr(),
      reportsService.getOutsourcingOrderDueDate(),
    ]);

  return {
    overdueJobs: {
      count: alerts.jobDueDate,
      examples: overdueJobs.map((job) => job.code).slice(0, EXAMPLE_COUNT),
    },
    overdueOrders: { count: stats.orderDueDate, examples: [] },
    dueSoonOrders: { count: stats.upcomingDueOrders, examples: [] },
    openNcrs: {
      count: alerts.openNcr,
      examples: openNcrs.map((ncr) => ncr.code).slice(0, EXAMPLE_COUNT),
    },
    lateOutsourcingOrders: {
      count: alerts.outsourcingOrderDueDate,
      examples: lateOutsourcing
        .map((order) => order.code)
        .slice(0, EXAMPLE_COUNT),
    },
    upcomingDeliveries: { count: alerts.upcomingDeliveries, examples: [] },
  };
}

export async function collectMaterialSignals(
  inventoryDirectsService: InventoryDirectsService,
): Promise<RiskSignals> {
  const fetchMaterials = (status: StockStatus) =>
    inventoryDirectsService.getInventoryDirects(
      createRequestDto(GetInventoryDirectsReqDto, {
        limit: EXAMPLE_COUNT,
        status,
      }),
    );
  const [shortages, warnings] = await Promise.all([
    fetchMaterials(StockStatus.SHORTAGE),
    fetchMaterials(StockStatus.WARNING),
  ]);

  return {
    materialShortages: {
      count: shortages.pagination.totalRecords,
      examples: shortages.data.map((material) => material.code),
    },
    materialWarnings: {
      count: warnings.pagination.totalRecords,
      examples: warnings.data.map((material) => material.code),
    },
  };
}

export async function collectPurchasingSignals(
  purchaseOrdersService: PurchaseOrdersService,
): Promise<RiskSignals> {
  const { orders } = await findOverduePurchaseOrders(purchaseOrdersService);
  return {
    overduePurchaseOrders: {
      count: orders.length,
      examples: orders.map((order) => order.code).slice(0, EXAMPLE_COUNT),
    },
  };
}
