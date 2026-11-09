import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { OutboundOrdersController } from './outbound-orders.controller';
import { OutboundOrderPdfService } from './outbound-order-pdf.service';
import { OutboundOrdersSummaryService } from './outbound-orders-summary.service';
import { OutboundOrdersService } from './outbound-orders.service';

@Module({
  imports: [TemplatesModule],
  controllers: [OutboundOrdersController],
  providers: [
    OutboundOrdersService,
    OutboundOrdersSummaryService,
    OutboundOrderPdfService,
  ],
  exports: [OutboundOrdersService],
})
export class OutboundOrdersModule {}
