import type { StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';

import { InventoryAiTools } from './inventory/inventory.ai-tools';
import { ProductionJobsAiTools } from './production-jobs/production-jobs.ai-tools';
import { PurchaseOrdersAiTools } from './purchase-orders/purchase-orders.ai-tools';
import { ReportsAiTools } from './reports/reports.ai-tools';
import { RiskAiTools } from './risk/risk.ai-tools';
import { OrdersAiTools } from './orders/orders.ai-tools';
import type { AiToolProvider } from './core/ai-tool.type';

/** Single place that decides which tool groups the agent has. */
@Injectable()
export class AiToolsService {
  private readonly toolProviders: AiToolProvider[];

  constructor(
    reportsTools: ReportsAiTools,
    productionJobsTools: ProductionJobsAiTools,
    ordersTools: OrdersAiTools,
    inventoryTools: InventoryAiTools,
    purchaseOrdersTools: PurchaseOrdersAiTools,
    riskTools: RiskAiTools,
  ) {
    this.toolProviders = [
      reportsTools,
      productionJobsTools,
      ordersTools,
      inventoryTools,
      purchaseOrdersTools,
      riskTools,
    ];
  }

  getTools(): StructuredToolInterface[] {
    return this.toolProviders.flatMap((provider) => provider.getTools());
  }
}
