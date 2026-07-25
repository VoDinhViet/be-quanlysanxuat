import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

// Read routes stay public; write routes (add/update/delete a node) need AuthModule for
// @CurrentUser/@Permissions/ApiAuth. Queries products/boms/bomItems directly via DRIZZLE (no
// ProductsModule import). FilesModule is needed for linking/deleting a node's own drawing file.
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
