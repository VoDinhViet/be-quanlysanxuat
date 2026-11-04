import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryPostingService } from './inventory-posting.service';
import { InventorySummaryService } from './inventory-summary.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryPostingService,
    InventorySummaryService,
  ],
  exports: [InventoryService, InventoryPostingService],
})
export class InventoryModule {}
