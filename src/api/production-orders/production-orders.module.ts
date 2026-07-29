import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductionJobsModule } from '../production-jobs/production-jobs.module';
import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersService } from './production-orders.service';

@Module({
  // `ProductionJobsModule` — `issueProductionOrders` gọi `ProductionJobsService.issueJobs` trong
  // transaction phát hành, xem docs/features/production.md.
  imports: [AuthModule, InventoryModule, ProductionJobsModule],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService],
  // Export để `OrdersModule` inject vào `OrdersService.approveOrder` — xem
  // docs/features/production.md.
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
