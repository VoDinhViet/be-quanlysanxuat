import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { InventoryRequisitionLinesService } from './inventory-requisition-lines.service';
import { InventoryRequisitionsController } from './inventory-requisitions.controller';
import { InventoryRequisitionsService } from './inventory-requisitions.service';

@Module({
  imports: [InventoryModule],
  controllers: [InventoryRequisitionsController],
  providers: [InventoryRequisitionsService, InventoryRequisitionLinesService],
})
export class InventoryRequisitionsModule {}
