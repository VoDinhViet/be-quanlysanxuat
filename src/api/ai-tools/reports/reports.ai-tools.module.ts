import { Module } from '@nestjs/common';

import { ReportsModule } from '../../reports/reports.module';
import { AiToolPermissionModule } from '../core/ai-tool-permission.module';
import { ReportsAiTools } from './reports.ai-tools';

@Module({
  imports: [ReportsModule, AiToolPermissionModule],
  providers: [ReportsAiTools],
  exports: [ReportsAiTools],
})
export class ReportsAiToolsModule {}
