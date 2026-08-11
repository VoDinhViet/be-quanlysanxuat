import { Module } from '@nestjs/common';

import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { PurchaseQuotationsController } from './purchase-quotations.controller';
import { PurchaseQuotationsService } from './purchase-quotations.service';

@Module({
  imports: [PurchaseOrdersModule],
  controllers: [PurchaseQuotationsController],
  providers: [PurchaseQuotationsService],
  exports: [PurchaseQuotationsService],
})
export class PurchaseQuotationsModule {}
