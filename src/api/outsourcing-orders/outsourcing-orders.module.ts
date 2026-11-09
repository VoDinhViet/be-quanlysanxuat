import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { OperationsModule } from '../operations/operations.module';
import { OutsourcingOrderPdfService } from './outsourcing-order-pdf.service';
import { OutsourcingOrdersController } from './outsourcing-orders.controller';
import { OutsourcingOrdersSummaryService } from './outsourcing-orders-summary.service';
import { OutsourcingOrdersService } from './outsourcing-orders.service';

@Module({
  imports: [OperationsModule, TemplatesModule],
  controllers: [OutsourcingOrdersController],
  providers: [
    OutsourcingOrdersService,
    OutsourcingOrdersSummaryService,
    OutsourcingOrderPdfService,
  ],
  exports: [OutsourcingOrdersService],
})
export class OutsourcingOrdersModule {}
