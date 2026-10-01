import { Module } from '@nestjs/common';

import { InventoryAiToolsModule } from './inventory/inventory.ai-tools.module';
import { OrdersAiToolsModule } from './orders/orders.ai-tools.module';
import { ProductionJobsAiToolsModule } from './production-jobs/production-jobs.ai-tools.module';
import { PurchaseOrdersAiToolsModule } from './purchase-orders/purchase-orders.ai-tools.module';
import { ReportsAiToolsModule } from './reports/reports.ai-tools.module';
import { RiskAiToolsModule } from './risk/risk.ai-tools.module';
import { AiToolsService } from './ai-tools.service';

@Module({
  imports: [
    ReportsAiToolsModule,
    ProductionJobsAiToolsModule,
    OrdersAiToolsModule,
    InventoryAiToolsModule,
    PurchaseOrdersAiToolsModule,
    RiskAiToolsModule,
  ],
  providers: [AiToolsService],
  exports: [AiToolsService],
})
export class AiToolsModule {}
