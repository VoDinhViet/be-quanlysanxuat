import { Module } from '@nestjs/common';

import { IqcController } from './iqc.controller';
import { IqcService } from './iqc.service';

@Module({
  controllers: [IqcController],
  providers: [IqcService],
  exports: [IqcService],
})
export class IqcModule {}
