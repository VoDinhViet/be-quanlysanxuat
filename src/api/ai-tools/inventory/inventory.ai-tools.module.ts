import { Module } from '@nestjs/common';

import { InventoryDirectsModule } from '../../inventory-directs/inventory-directs.module';
import { AiToolPermissionModule } from '../core/ai-tool-permission.module';
import { InventoryAiTools } from './inventory.ai-tools';

@Module({
  imports: [InventoryDirectsModule, AiToolPermissionModule],
  providers: [InventoryAiTools],
  exports: [InventoryAiTools],
})
export class InventoryAiToolsModule {}
