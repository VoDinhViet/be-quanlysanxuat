import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { InventoryRequisitionPdfService } from './inventory-requisition-pdf.service';
import { InventoryRequisitionLinesService } from './inventory-requisition-lines.service';
import { InventoryRequisitionsController } from './inventory-requisitions.controller';
import { InventoryRequisitionsService } from './inventory-requisitions.service';

@Module({
  imports: [TemplatesModule],
  controllers: [InventoryRequisitionsController],
  providers: [
    InventoryRequisitionsService,
    InventoryRequisitionLinesService,
    InventoryRequisitionPdfService,
  ],
})
export class InventoryRequisitionsModule {}
