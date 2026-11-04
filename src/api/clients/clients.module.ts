import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsController } from './clients.controller';
import { ClientsSummaryService } from './clients-summary.service';
import { ClientsService } from './clients.service';

@Module({
  imports: [AuthModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientsSummaryService],
  exports: [ClientsService],
})
export class ClientsModule {}
