import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryProductsController } from './inventory-products.controller';
import { InventoryProductsService } from './inventory-products.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryProductsController],
  providers: [InventoryProductsService],
})
export class InventoryProductsModule {}
