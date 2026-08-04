import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BomsModule } from '../boms/boms.module';
import { BomMaterialsController } from './bom-materials.controller';
import { BomMaterialsService } from './bom-materials.service';

@Module({
  imports: [AuthModule, BomsModule],
  controllers: [BomMaterialsController],
  providers: [BomMaterialsService],
})
export class BomMaterialsModule {}
