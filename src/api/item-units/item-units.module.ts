import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ItemUnitsController } from './item-units.controller';
import { ItemUnitsService } from './item-units.service';

@Module({
  imports: [AuthModule],
  controllers: [ItemUnitsController],
  providers: [ItemUnitsService],
})
export class ItemUnitsModule {}
