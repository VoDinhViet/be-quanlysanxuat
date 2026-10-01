import { AIMessageChunk } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAgent } from 'langchain';
import { Observable } from 'rxjs';

import { AllConfigType } from '../../config/config.type';
import { AgentService } from './agent.service';
import { SYSTEM_PROMPT } from './system-prompt.constant';
import { AiToolsService } from '../ai-tools/ai-tools.service';
import { USER_ID_CONFIG_KEY } from '../ai-tools/core/ai-tool.context';

@Injectable()
export class InteractiveAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InteractiveAgentService.name);
  private checkpointer!: PostgresSaver;
  private agent!: ReturnType<typeof createAgent>;

  constructor(
    private readonly agentService: AgentService,
    private readonly toolRegistry: AiToolsService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = this.configService.getOrThrow('database.url', {
      infer: true,
    });

    this.checkpointer = PostgresSaver.fromConnString(databaseUrl, {
      // Kept out of `public` so drizzle's migrations never see LangGraph's tables.
      schema: 'langgraph',
    });
    await this.checkpointer.setup();

    this.agent = createAgent({
      model: this.agentService.model,
      tools: this.toolRegistry.getTools(),
      checkpointer: this.checkpointer,
      systemPrompt: SYSTEM_PROMPT,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.checkpointer?.end();
  }

  stream(
    userId: string,
    conversationId: string,
    question: string,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const controller = new AbortController();

      void (async () => {
        try {
          const chunks = await this.agent.stream(
            { messages: [{ role: 'user', content: question }] },
            {
              // The userId prefix keeps one user from reading another's conversation by guessing its id.
              configurable: {
                thread_id: `${userId}:${conversationId}`,
                [USER_ID_CONFIG_KEY]: userId,
              },
              streamMode: 'messages',
              signal: controller.signal,
            },
          );

          for await (const [chunk] of chunks) {
            // Skips tool messages and tool-call-only chunks, which carry no text for the user.
            if (AIMessageChunk.isInstance(chunk) && chunk.text) {
              subscriber.next({ type: 'delta', data: { text: chunk.text } });
            }
          }
          subscriber.next({ type: 'done', data: {} });
          subscriber.complete();
        } catch (error) {
          // Aborted means the client already left; there is nobody to report to.
          if (controller.signal.aborted) {
            return;
          }
          this.logger.error(error);
          // Generic on purpose: the original message may leak provider or DB details.
          subscriber.error(
            new Error('Trợ lý tạm thời không trả lời được, vui lòng thử lại.'),
          );
        }
      })();

      return () => controller.abort();
    });
  }
}
