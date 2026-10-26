import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { PaymentRequestsModule } from '../payment-requests/payment-requests.module';
import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { PurchaseOrderPdfService } from './purchase-order-pdf.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [PaymentRequestsModule, PurchaseNotesModule, TemplatesModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrderPdfService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
