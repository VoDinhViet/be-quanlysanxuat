import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { IqcModule } from '../iqc/iqc.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { OutsourcingReceiptsController } from './outsourcing-receipts.controller';
import { OutsourcingReceiptsService } from './outsourcing-receipts.service';

@Module({
  imports: [InventoryModule, WarehousesModule, IqcModule],
  controllers: [OutsourcingReceiptsController],
  providers: [OutsourcingReceiptsService],
  exports: [OutsourcingReceiptsService],
})
export class OutsourcingReceiptsModule {}
