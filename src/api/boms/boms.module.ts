import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

// Read routes stay public; write routes (add/update/delete a node) need AuthModule for
// @CurrentUser/@Permissions/ApiAuth. Queries products/boms/bomItems directly via DRIZZLE (no
// ProductsModule import).
@Module({
  imports: [AuthModule],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
