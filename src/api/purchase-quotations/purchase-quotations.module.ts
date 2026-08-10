import { Module } from '@nestjs/common';

import { PurchaseQuotationsController } from './purchase-quotations.controller';
import { PurchaseQuotationsService } from './purchase-quotations.service';

@Module({
  controllers: [PurchaseQuotationsController],
  providers: [PurchaseQuotationsService],
  exports: [PurchaseQuotationsService],
})
export class PurchaseQuotationsModule {}
