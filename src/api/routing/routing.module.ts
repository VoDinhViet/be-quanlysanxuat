import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BomItemRoutingController } from './bom-item-routing.controller';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

// AuthModule is needed for the write routes' guards (@ApiAuth), mirroring BomsModule. Otherwise
// standalone — queries products/bomItems/operations/routingSteps directly via DRIZZLE, no
// ProductsModule/BomsModule/OperationsModule import. Two controllers share one service: one for
// a product's own (Cấp 0) routing, one for a single BOM node's as-used routing.
@Module({
  imports: [AuthModule],
  controllers: [RoutingController, BomItemRoutingController],
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
