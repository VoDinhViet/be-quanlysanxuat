import { Module } from '@nestjs/common';

import { OutboundOrdersController } from './outbound-orders.controller';
import { OutboundOrdersSummaryService } from './outbound-orders-summary.service';
import { OutboundOrdersService } from './outbound-orders.service';

@Module({
  controllers: [OutboundOrdersController],
  providers: [OutboundOrdersService, OutboundOrdersSummaryService],
  exports: [OutboundOrdersService],
})
export class OutboundOrdersModule {}
