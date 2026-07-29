import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { ProductionOrdersModule } from '../production-orders/production-orders.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  // `ProductionOrdersModule` — `OrdersService.approveOrder` sinh sẵn kế hoạch sản xuất qua
  // `ProductionOrdersService` (docs/features/production.md). Không có vòng phụ thuộc:
  // `ProductionOrdersModule` chỉ import `AuthModule`/`InventoryModule`, cả hai đều không import
  // `OrdersModule`.
  imports: [AuthModule, FilesModule, ProductionOrdersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
