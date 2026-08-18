import { Module } from '@nestjs/common';

import { OutsourcingOrdersController } from './outsourcing-orders.controller';
import { OutsourcingOrdersService } from './outsourcing-orders.service';

@Module({
  controllers: [OutsourcingOrdersController],
  providers: [OutsourcingOrdersService],
  exports: [OutsourcingOrdersService],
})
export class OutsourcingOrdersModule {}
