import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryAdjustmentsModule } from '../inventory-adjustments/inventory-adjustments.module';
import { InventoryDirectImportService } from './inventory-direct-import.service';
import { InventoryDirectsController } from './inventory-directs.controller';
import { InventoryDirectsService } from './inventory-directs.service';

@Module({
  imports: [AuthModule, InventoryAdjustmentsModule],
  controllers: [InventoryDirectsController],
  providers: [InventoryDirectsService, InventoryDirectImportService],
})
export class InventoryDirectsModule {}
