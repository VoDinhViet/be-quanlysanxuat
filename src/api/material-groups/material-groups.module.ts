import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MaterialGroupsController } from './material-groups.controller';
import { MaterialGroupsService } from './material-groups.service';

@Module({
  imports: [AuthModule],
  controllers: [MaterialGroupsController],
  providers: [MaterialGroupsService],
  exports: [MaterialGroupsService],
})
export class MaterialGroupsModule {}
