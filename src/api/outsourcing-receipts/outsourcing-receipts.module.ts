import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { IqcModule } from '../iqc/iqc.module';
import { OutsourcingReceiptPdfService } from './outsourcing-receipt-pdf.service';
import { OutsourcingReceiptsController } from './outsourcing-receipts.controller';
import { OutsourcingReceiptsService } from './outsourcing-receipts.service';

@Module({
  imports: [IqcModule, TemplatesModule],
  controllers: [OutsourcingReceiptsController],
  providers: [OutsourcingReceiptsService, OutsourcingReceiptPdfService],
  exports: [OutsourcingReceiptsService],
})
export class OutsourcingReceiptsModule {}
