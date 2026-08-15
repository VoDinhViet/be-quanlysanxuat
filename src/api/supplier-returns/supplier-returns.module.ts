import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { SupplierReturnsController } from './supplier-returns.controller';
import { SupplierReturnsService } from './supplier-returns.service';

@Module({
  imports: [InventoryModule],
  controllers: [SupplierReturnsController],
  providers: [SupplierReturnsService],
  exports: [SupplierReturnsService],
})
export class SupplierReturnsModule {}
