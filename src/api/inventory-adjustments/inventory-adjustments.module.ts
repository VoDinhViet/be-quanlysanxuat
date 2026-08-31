import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [InventoryAdjustmentsController],
  providers: [InventoryAdjustmentsService],
})
export class InventoryAdjustmentsModule {}
