import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { BomItemMaterialsController } from './bom-item-materials.controller';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [BomsController, BomItemMaterialsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
