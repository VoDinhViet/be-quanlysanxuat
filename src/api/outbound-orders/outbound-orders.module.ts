import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { OutboundOrdersController } from './outbound-orders.controller';
import { OutboundOrdersService } from './outbound-orders.service';

@Module({
  imports: [InventoryModule],
  controllers: [OutboundOrdersController],
  providers: [OutboundOrdersService],
  exports: [OutboundOrdersService],
})
export class OutboundOrdersModule {}
