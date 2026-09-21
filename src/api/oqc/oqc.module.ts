import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { OqcController } from './oqc.controller';
import { OqcService } from './oqc.service';

@Module({
  imports: [FilesModule],
  controllers: [OqcController],
  providers: [OqcService],
  exports: [OqcService],
})
export class OqcModule {}
