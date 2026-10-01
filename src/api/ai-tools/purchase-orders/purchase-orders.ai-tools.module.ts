import { Module } from '@nestjs/common';

import { PurchaseOrdersModule } from '../../purchase-orders/purchase-orders.module';
import { AiToolPermissionModule } from '../core/ai-tool-permission.module';
import { PurchaseOrdersAiTools } from './purchase-orders.ai-tools';

@Module({
  imports: [PurchaseOrdersModule, AiToolPermissionModule],
  providers: [PurchaseOrdersAiTools],
  exports: [PurchaseOrdersAiTools],
})
export class PurchaseOrdersAiToolsModule {}
