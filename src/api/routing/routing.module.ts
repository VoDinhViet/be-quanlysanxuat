import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BomItemRoutingController } from './bom-item-routing.controller';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

@Module({
  imports: [AuthModule],
  controllers: [RoutingController, BomItemRoutingController],
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
