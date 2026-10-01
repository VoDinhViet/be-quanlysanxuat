import { AiToolPermissionService } from './ai-tool-permission.service';

describe('AiToolPermissionService.withPermission', () => {
  const getPermissionCodes = jest.fn();
  const handler = jest.fn();
  const service = new AiToolPermissionService({ getPermissionCodes } as never);
  const run = () =>
    service.withPermission('reports:read', handler)(
      { question: 'x' },
      { configurable: { userId: 'user-1' } },
    );

  beforeEach(() => {
    jest.clearAllMocks();
    handler.mockResolvedValue('handled');
  });

  it('runs the handler when the user holds the permission', async () => {
    getPermissionCodes.mockResolvedValue(['reports:read']);

    await expect(run()).resolves.toBe('handled');
    expect(handler).toHaveBeenCalledWith({ question: 'x' });
  });

  it('lets a super admin through every permission', async () => {
    getPermissionCodes.mockResolvedValue(['system:manage']);

    await expect(run()).resolves.toBe('handled');
  });

  it('returns FORBIDDEN without running the handler otherwise', async () => {
    getPermissionCodes.mockResolvedValue(['orders:read']);

    const result = JSON.parse(await run()) as { error: string };

    expect(result.error).toBe('FORBIDDEN');
    expect(handler).not.toHaveBeenCalled();
  });

  it('refuses a call that carries no user id', async () => {
    await expect(
      service.withPermission('reports:read', handler)({}, { configurable: {} }),
    ).rejects.toThrow('without a user id');
    expect(getPermissionCodes).not.toHaveBeenCalled();
  });
});
