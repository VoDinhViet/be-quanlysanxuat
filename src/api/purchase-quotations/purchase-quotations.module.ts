import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { PurchaseQuotationsController } from './purchase-quotations.controller';
import { PurchaseQuotationsService } from './purchase-quotations.service';
import { PurchaseQuotationsSummaryService } from './purchase-quotations-summary.service';

@Module({
  imports: [FilesModule, PurchaseOrdersModule, PurchaseNotesModule],
  controllers: [PurchaseQuotationsController],
  providers: [PurchaseQuotationsService, PurchaseQuotationsSummaryService],
  exports: [PurchaseQuotationsService],
})
export class PurchaseQuotationsModule {}
