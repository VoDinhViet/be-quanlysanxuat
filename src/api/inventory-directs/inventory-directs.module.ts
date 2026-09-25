import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryDirectsController } from './inventory-directs.controller';
import { InventoryDirectsService } from './inventory-directs.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryDirectsController],
  providers: [InventoryDirectsService],
})
export class InventoryDirectsModule {}
