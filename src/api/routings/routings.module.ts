import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BomsModule } from '../boms/boms.module';
import { RoutingsController } from './routings.controller';
import { RoutingsService } from './routings.service';

@Module({
  imports: [AuthModule, BomsModule],
  controllers: [RoutingsController],
  providers: [RoutingsService],
})
export class RoutingsModule {}
