import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
