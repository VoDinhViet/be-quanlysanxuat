import { Module } from '@nestjs/common';

import { ProductionJobsModule } from '../../production-jobs/production-jobs.module';
import { AiToolPermissionModule } from '../core/ai-tool-permission.module';
import { ProductionJobsAiTools } from './production-jobs.ai-tools';

@Module({
  imports: [ProductionJobsModule, AiToolPermissionModule],
  providers: [ProductionJobsAiTools],
  exports: [ProductionJobsAiTools],
})
export class ProductionJobsAiToolsModule {}
