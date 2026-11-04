import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { SupplierReturnsModule } from '../supplier-returns/supplier-returns.module';
import { IqcController } from './iqc.controller';
import { IqcService } from './iqc.service';
import { IqcSummaryService } from './iqc-summary.service';

@Module({
  imports: [FilesModule, SupplierReturnsModule],
  controllers: [IqcController],
  providers: [IqcService, IqcSummaryService],
  exports: [IqcService],
})
export class IqcModule {}
