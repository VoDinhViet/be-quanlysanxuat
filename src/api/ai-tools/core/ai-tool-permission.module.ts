import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { AiToolPermissionService } from './ai-tool-permission.service';

/** Provides `AiToolPermissionService` to every domain tool module. */
@Module({
  imports: [AuthModule],
  providers: [AiToolPermissionService],
  exports: [AiToolPermissionService],
})
export class AiToolPermissionModule {}
