import { Module } from '@nestjs/common';

import { ClientGroupsController } from './client-groups.controller';
import { ClientGroupsService } from './client-groups.service';

@Module({
  controllers: [ClientGroupsController],
  providers: [ClientGroupsService],
  exports: [ClientGroupsService],
})
export class ClientGroupsModule {}
