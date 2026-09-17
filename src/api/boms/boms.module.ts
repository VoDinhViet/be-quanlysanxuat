import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { UnitsModule } from '../units/units.module';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

@Module({
  imports: [AuthModule, FilesModule, UnitsModule],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
