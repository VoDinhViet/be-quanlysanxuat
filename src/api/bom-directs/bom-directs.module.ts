import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BomsModule } from '../boms/boms.module';
import { BomDirectsController } from './bom-directs.controller';
import { BomDirectsService } from './bom-directs.service';

@Module({
  imports: [AuthModule, BomsModule],
  controllers: [BomDirectsController],
  providers: [BomDirectsService],
})
export class BomDirectsModule {}
