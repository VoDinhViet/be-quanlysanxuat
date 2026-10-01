import { Module } from '@nestjs/common';

import { InventoryDirectsModule } from '../inventory-directs/inventory-directs.module';
import { InventoryRequisitionLinesService } from './inventory-requisition-lines.service';
import { InventoryRequisitionsController } from './inventory-requisitions.controller';
import { InventoryRequisitionsService } from './inventory-requisitions.service';

@Module({
  imports: [InventoryDirectsModule],
  controllers: [InventoryRequisitionsController],
  providers: [InventoryRequisitionsService, InventoryRequisitionLinesService],
})
export class InventoryRequisitionsModule {}
