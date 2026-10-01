import { Module } from '@nestjs/common';

import { InventoryDirectsModule } from '../../inventory-directs/inventory-directs.module';
import { PurchaseOrdersModule } from '../../purchase-orders/purchase-orders.module';
import { ReportsModule } from '../../reports/reports.module';
import { AiToolPermissionModule } from '../core/ai-tool-permission.module';
import { RiskAiTools } from './risk.ai-tools';

@Module({
  imports: [
    ReportsModule,
    InventoryDirectsModule,
    PurchaseOrdersModule,
    AiToolPermissionModule,
  ],
  providers: [RiskAiTools],
  exports: [RiskAiTools],
})
export class RiskAiToolsModule {}
