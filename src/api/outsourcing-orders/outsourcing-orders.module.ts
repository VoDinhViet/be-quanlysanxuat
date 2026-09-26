import { Module } from '@nestjs/common';

import { OperationsModule } from '../operations/operations.module';
import { OutsourcingOrdersController } from './outsourcing-orders.controller';
import { OutsourcingOrdersService } from './outsourcing-orders.service';

@Module({
  imports: [OperationsModule],
  controllers: [OutsourcingOrdersController],
  providers: [OutsourcingOrdersService],
  exports: [OutsourcingOrdersService],
})
export class OutsourcingOrdersModule {}
