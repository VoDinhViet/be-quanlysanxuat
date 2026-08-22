import { Module } from '@nestjs/common';

import { QcAqlController } from './qc-aql.controller';
import { QcAqlService } from './qc-aql.service';

@Module({
  controllers: [QcAqlController],
  providers: [QcAqlService],
  exports: [QcAqlService],
})
export class QcAqlModule {}
