import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProductionJobsController } from './production-jobs.controller';
import { ProductionJobsService } from './production-jobs.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductionJobsController],
  providers: [ProductionJobsService],
  // Export để `ProductionOrdersModule` inject vào `ProductionOrdersService.approveProductionOrder`
  // (sinh Job khi duyệt LSX, 2026-07-30) — xem docs/features/production.md.
  exports: [ProductionJobsService],
})
export class ProductionJobsModule {}
