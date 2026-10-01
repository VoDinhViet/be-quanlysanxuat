import { AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { ConfigService } from '@nestjs/config';
import { createAgent } from 'langchain';
import { lastValueFrom, toArray } from 'rxjs';

import type { AgentService } from './agent.service';
import type { AiToolsService } from '../ai-tools/ai-tools.service';
import { InteractiveAgentService } from './interactive-agent.service';

const mockFromConnString = jest.fn();
jest.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: {
    fromConnString: (...args: unknown[]): unknown =>
      mockFromConnString(...args),
  },
}));
jest.mock('langchain', () => ({ createAgent: jest.fn() }));
// The real registry pulls in OrdersService -> puppeteer, which is ESM-only.
jest.mock('../ai-tools/ai-tools.service', () => ({
  AiToolsService: class {},
}));
jest.mock('@langchain/openrouter', () => ({ ChatOpenRouter: class {} }));

async function* chunksOf(...messages: unknown[]) {
  for (const message of messages) {
    await Promise.resolve();
    yield [message, {}];
  }
}

describe('InteractiveAgentService', () => {
  const agentStream = jest.fn();
  const setup = jest.fn();
  const tools = [{ name: 'get_operations_overview' }];
  let service: InteractiveAgentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFromConnString.mockReturnValue({ setup, end: jest.fn() });
    (createAgent as jest.Mock).mockReturnValue({ stream: agentStream });

    const configService = {
      getOrThrow: jest.fn().mockReturnValue('postgres://db'),
    } as unknown as ConfigService;

    service = new InteractiveAgentService(
      { model: {} } as AgentService,
      { getTools: () => tools } as unknown as AiToolsService,
      configService,
    );
    await service.onModuleInit();
  });

  it('keeps conversations in their own Postgres schema and creates the tables', () => {
    expect(mockFromConnString).toHaveBeenCalledWith('postgres://db', {
      schema: 'langgraph',
    });
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it('gives the agent the registered tools', () => {
    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ tools }),
    );
  });

  it('streams only the text pieces, then done', async () => {
    agentStream.mockResolvedValue(
      chunksOf(
        new AIMessageChunk('Trí '),
        new ToolMessage({ content: 'tool output', tool_call_id: 't1' }),
        new AIMessageChunk(''),
        new AIMessageChunk('tuệ'),
      ),
    );

    const events = await lastValueFrom(
      service.stream('user-1', 'conv-1', 'AI là gì').pipe(toArray()),
    );

    expect(events).toEqual([
      { type: 'delta', data: { text: 'Trí ' } },
      { type: 'delta', data: { text: 'tuệ' } },
      { type: 'done', data: {} },
    ]);
    expect(agentStream).toHaveBeenCalledWith(
      { messages: [{ role: 'user', content: 'AI là gì' }] },
      expect.objectContaining({
        configurable: { thread_id: 'user-1:conv-1', userId: 'user-1' },
        streamMode: 'messages',
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  it('aborts the model call when the client unsubscribes', async () => {
    agentStream.mockResolvedValue(chunksOf(new AIMessageChunk('x')));

    const subscription = service.stream('u', 'c', 'q').subscribe();
    await Promise.resolve();
    subscription.unsubscribe();

    const { signal } = (
      agentStream.mock.calls[0] as [unknown, { signal: AbortSignal }]
    )[1];
    expect(signal.aborted).toBe(true);
  });

  it('hides the original error message from the client', async () => {
    agentStream.mockRejectedValue(
      new Error('openrouter key sk-secret rejected'),
    );
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    await expect(
      lastValueFrom(service.stream('u', 'c', 'q').pipe(toArray())),
    ).rejects.toThrow('Trợ lý tạm thời không trả lời được');
  });
});
