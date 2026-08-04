import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryPostingService } from './inventory-posting.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryPostingService],
  exports: [InventoryService, InventoryPostingService],
})
export class InventoryModule {}
