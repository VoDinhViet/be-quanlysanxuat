import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { InventoryIssuesController } from './inventory-issues.controller';
import { InventoryIssuesService } from './inventory-issues.service';

@Module({
  imports: [AuthModule, InventoryModule, WarehousesModule],
  controllers: [InventoryIssuesController],
  providers: [InventoryIssuesService],
})
export class InventoryIssuesModule {}
