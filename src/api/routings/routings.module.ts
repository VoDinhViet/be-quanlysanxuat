import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RoutingsController } from './routings.controller';
import { RoutingsService } from './routings.service';

@Module({
  imports: [AuthModule],
  controllers: [RoutingsController],
  providers: [RoutingsService],
  exports: [RoutingsService],
})
export class RoutingsModule {}
