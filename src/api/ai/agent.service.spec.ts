import { ConfigService } from '@nestjs/config';

import { AgentService } from './agent.service';

// eventsource-parser (a transitive dep) is ESM-only, which jest's CJS runtime can't load.
jest.mock('@langchain/openrouter', () => ({
  ChatOpenRouter: class {
    constructor(public readonly params: { model: string }) {}
  },
}));

describe('AgentService', () => {
  it('builds the model from config', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue({
        openRouterApiKey: 'test-key',
        model: 'deepseek/deepseek-v4-flash',
        temperature: 0,
      }),
    } as unknown as ConfigService;

    const { model } = new AgentService(configService);

    expect(model).toMatchObject({
      params: {
        apiKey: 'test-key',
        model: 'deepseek/deepseek-v4-flash',
        temperature: 0,
      },
    });
  });
});
