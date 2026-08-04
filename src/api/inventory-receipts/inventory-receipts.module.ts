import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { InventoryReceiptsController } from './inventory-receipts.controller';
import { InventoryReceiptsService } from './inventory-receipts.service';

@Module({
  imports: [AuthModule, InventoryModule, WarehousesModule],
  controllers: [InventoryReceiptsController],
  providers: [InventoryReceiptsService],
})
export class InventoryReceiptsModule {}
