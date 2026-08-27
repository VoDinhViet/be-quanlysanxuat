import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InventoryMaterialsController } from './inventory-materials.controller';
import { InventoryMaterialsService } from './inventory-materials.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryMaterialsController],
  providers: [InventoryMaterialsService],
})
export class InventoryMaterialsModule {}
