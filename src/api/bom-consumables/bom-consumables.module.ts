import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BomsModule } from '../boms/boms.module';
import { BomConsumablesController } from './bom-consumables.controller';
import { BomConsumablesService } from './bom-consumables.service';

@Module({
  imports: [AuthModule, BomsModule],
  controllers: [BomConsumablesController],
  providers: [BomConsumablesService],
})
export class BomConsumablesModule {}
