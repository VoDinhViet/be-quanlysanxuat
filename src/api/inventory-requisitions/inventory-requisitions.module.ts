import { Module } from '@nestjs/common';

import { InventoryRequisitionLinesService } from './inventory-requisition-lines.service';
import { InventoryRequisitionsController } from './inventory-requisitions.controller';
import { InventoryRequisitionsService } from './inventory-requisitions.service';

@Module({
  controllers: [InventoryRequisitionsController],
  providers: [InventoryRequisitionsService, InventoryRequisitionLinesService],
})
export class InventoryRequisitionsModule {}
