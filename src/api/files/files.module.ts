import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesCleanupService } from './files-cleanup.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [FilesService, FilesCleanupService],
  exports: [FilesService],
})
export class FilesModule {}
