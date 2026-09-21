import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BomsModule } from '../boms/boms.module';
import { BomOperationsController } from './bom-operations.controller';
import { BomOperationsService } from './bom-operations.service';

@Module({
  imports: [AuthModule, BomsModule],
  controllers: [BomOperationsController],
  providers: [BomOperationsService],
})
export class BomOperationsModule {}
