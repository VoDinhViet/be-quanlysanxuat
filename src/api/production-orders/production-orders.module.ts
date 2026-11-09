import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductionJobsModule } from '../production-jobs/production-jobs.module';
import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersSummaryService } from './production-orders-summary.service';
import { ProductionOrdersService } from './production-orders.service';

@Module({
  imports: [AuthModule, FilesModule, InventoryModule, ProductionJobsModule],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService, ProductionOrdersSummaryService],
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
