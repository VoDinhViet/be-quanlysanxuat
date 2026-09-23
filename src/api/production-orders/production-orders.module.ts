import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductionJobsModule } from '../production-jobs/production-jobs.module';
import { TemplatesModule } from '../../templates/templates.module';
import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersService } from './production-orders.service';

@Module({
  imports: [
    AuthModule,
    FilesModule,
    InventoryModule,
    ProductionJobsModule,
    TemplatesModule,
  ],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService],
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
