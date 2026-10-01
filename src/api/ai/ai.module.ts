import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AiController } from './ai.controller';
import { AgentService } from './agent.service';
import { InteractiveAgentService } from './interactive-agent.service';
import aiConfig from './config/ai.config';
import { AiToolsModule } from '../ai-tools/ai-tools.module';

@Module({
  imports: [ConfigModule.forFeature(aiConfig), AiToolsModule],
  controllers: [AiController],
  providers: [AgentService, InteractiveAgentService],
  exports: [AgentService],
})
export class AiModule {}
