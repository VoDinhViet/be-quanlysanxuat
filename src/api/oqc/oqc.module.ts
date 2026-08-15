import { Module } from '@nestjs/common';

import { OqcController } from './oqc.controller';
import { OqcService } from './oqc.service';

@Module({
  controllers: [OqcController],
  providers: [OqcService],
  exports: [OqcService],
})
export class OqcModule {}
