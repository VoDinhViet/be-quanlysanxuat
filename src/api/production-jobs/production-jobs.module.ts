import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OperationsModule } from '../operations/operations.module';
import { OqcModule } from '../oqc/oqc.module';
import { PurchaseRequestsModule } from '../purchase-requests/purchase-requests.module';
import { UsersModule } from '../users/users.module';
import { ProductionJobsController } from './production-jobs.controller';
import { ProductionJobsService } from './production-jobs.service';

@Module({
  imports: [
    AuthModule,
    InventoryModule,
    OperationsModule,
    OqcModule,
    PurchaseRequestsModule,
    TemplatesModule,
    UsersModule,
  ],
  controllers: [ProductionJobsController],
  providers: [ProductionJobsService],
  exports: [ProductionJobsService],
})
export class ProductionJobsModule {}
