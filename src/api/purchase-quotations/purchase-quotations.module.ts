import { Module } from '@nestjs/common';

import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { PurchaseQuotationsController } from './purchase-quotations.controller';
import { PurchaseQuotationsService } from './purchase-quotations.service';

@Module({
  imports: [PurchaseOrdersModule, PurchaseNotesModule],
  controllers: [PurchaseQuotationsController],
  providers: [PurchaseQuotationsService],
  exports: [PurchaseQuotationsService],
})
export class PurchaseQuotationsModule {}
