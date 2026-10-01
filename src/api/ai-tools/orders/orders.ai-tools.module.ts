import { Module } from '@nestjs/common';

import { OrdersModule } from '../../orders/orders.module';
import { AiToolPermissionModule } from '../core/ai-tool-permission.module';
import { OrdersAiTools } from './orders.ai-tools';

@Module({
  imports: [OrdersModule, AiToolPermissionModule],
  providers: [OrdersAiTools],
  exports: [OrdersAiTools],
})
export class OrdersAiToolsModule {}
