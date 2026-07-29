import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProductionJobsController } from './production-jobs.controller';
import { ProductionJobsService } from './production-jobs.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductionJobsController],
  providers: [ProductionJobsService],
  // `ProductionOrdersModule` gọi `issueJobs` trong transaction phát hành LSX của nó.
  exports: [ProductionJobsService],
})
export class ProductionJobsModule {}
