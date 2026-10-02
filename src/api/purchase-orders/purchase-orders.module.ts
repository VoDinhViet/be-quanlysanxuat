import { Module } from '@nestjs/common';

import { PaymentRequestsModule } from '../payment-requests/payment-requests.module';
import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [PaymentRequestsModule, PurchaseNotesModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
