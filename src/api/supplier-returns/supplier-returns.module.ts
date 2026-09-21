import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SupplierReturnsController } from './supplier-returns.controller';
import { SupplierReturnsService } from './supplier-returns.service';

@Module({
  imports: [InventoryModule, FilesModule],
  controllers: [SupplierReturnsController],
  providers: [SupplierReturnsService],
  exports: [SupplierReturnsService],
})
export class SupplierReturnsModule {}
