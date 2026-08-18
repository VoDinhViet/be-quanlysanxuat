import { Module } from '@nestjs/common';

import { IqcModule } from '../iqc/iqc.module';
import { OutsourcingReceiptsController } from './outsourcing-receipts.controller';
import { OutsourcingReceiptsService } from './outsourcing-receipts.service';

@Module({
  imports: [IqcModule],
  controllers: [OutsourcingReceiptsController],
  providers: [OutsourcingReceiptsService],
  exports: [OutsourcingReceiptsService],
})
export class OutsourcingReceiptsModule {}
