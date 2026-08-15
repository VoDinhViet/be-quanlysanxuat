import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { OutsourcingOrdersController } from './outsourcing-orders.controller';
import { OutsourcingOrdersService } from './outsourcing-orders.service';

@Module({
  imports: [InventoryModule, WarehousesModule],
  controllers: [OutsourcingOrdersController],
  providers: [OutsourcingOrdersService],
  exports: [OutsourcingOrdersService],
})
export class OutsourcingOrdersModule {}
