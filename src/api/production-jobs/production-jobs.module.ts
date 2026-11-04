import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { AuthModule } from '../auth/auth.module';
import { OperationsModule } from '../operations/operations.module';
import { OqcModule } from '../oqc/oqc.module';
import { PurchaseRequestsModule } from '../purchase-requests/purchase-requests.module';
import { UsersModule } from '../users/users.module';
import { ProductionJobsController } from './production-jobs.controller';
import { ProductionJobsSummaryService } from './production-jobs-summary.service';
import { ProductionJobsService } from './production-jobs.service';

@Module({
  imports: [
    AuthModule,
    OperationsModule,
    OqcModule,
    PurchaseRequestsModule,
    TemplatesModule,
    UsersModule,
  ],
  controllers: [ProductionJobsController],
  providers: [ProductionJobsService, ProductionJobsSummaryService],
  exports: [ProductionJobsService],
})
export class ProductionJobsModule {}
