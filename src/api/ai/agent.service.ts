import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenRouter } from '@langchain/openrouter';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AllConfigType } from '../../config/config.type';

@Injectable()
export class AgentService {
  readonly model: BaseChatModel;

  constructor(configService: ConfigService<AllConfigType>) {
    const { openRouterApiKey, model, temperature } = configService.getOrThrow(
      'ai',
      { infer: true },
    );

    this.model = new ChatOpenRouter({
      apiKey: openRouterApiKey,
      model,
      temperature,
    });
  }
}
