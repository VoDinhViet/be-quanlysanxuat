import { Module } from '@nestjs/common';

import { OperationsModule } from '../operations/operations.module';
import { OutsourcingOrdersController } from './outsourcing-orders.controller';
import { OutsourcingOrdersSummaryService } from './outsourcing-orders-summary.service';
import { OutsourcingOrdersService } from './outsourcing-orders.service';

@Module({
  imports: [OperationsModule],
  controllers: [OutsourcingOrdersController],
  providers: [OutsourcingOrdersService, OutsourcingOrdersSummaryService],
  exports: [OutsourcingOrdersService],
})
export class OutsourcingOrdersModule {}
