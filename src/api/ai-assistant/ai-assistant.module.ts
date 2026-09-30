import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';

@Module({
  imports: [AuthModule, ReportsModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
