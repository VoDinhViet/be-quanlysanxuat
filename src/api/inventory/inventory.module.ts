import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockReceiptsController } from './stock-receipts.controller';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController, StockReceiptsController],
  providers: [InventoryService, StockReceiptsService],
  exports: [InventoryService, StockReceiptsService],
})
export class InventoryModule {}
