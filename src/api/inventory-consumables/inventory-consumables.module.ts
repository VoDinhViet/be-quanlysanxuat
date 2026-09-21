import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryConsumablesController } from './inventory-consumables.controller';
import { InventoryConsumablesService } from './inventory-consumables.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryConsumablesController],
  providers: [InventoryConsumablesService],
})
export class InventoryConsumablesModule {}
