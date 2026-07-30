import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductionJobsModule } from '../production-jobs/production-jobs.module';
import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersService } from './production-orders.service';

@Module({
  // `ProductionJobsModule` import lại 2026-07-30 (đã gỡ cùng ngày lúc "Tạo LSX" bị bỏ) —
  // `approveProductionOrder` gọi `ProductionJobsService.createJobs` để sinh Job khi duyệt LSX.
  imports: [AuthModule, InventoryModule, ProductionJobsModule],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService],
  // Export để `OrdersModule` inject vào `OrdersService.approveOrder` — xem
  // docs/features/production.md.
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
