import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthService } from '../auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let authService: { verifyAccessToken: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  const buildContext = (authorization?: string) => {
    const request: { headers: { authorization?: string }; user?: unknown } = {
      headers: authorization ? { authorization } : {},
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
    return { context, request };
  };

  beforeEach(() => {
    authService = { verifyAccessToken: jest.fn() };
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(
      authService as unknown as AuthService,
      reflector as unknown as Reflector,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows public routes without checking a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = buildContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('verifies the bearer token and attaches the payload to the request', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const payload = { sub: 'cred-1' };
    authService.verifyAccessToken.mockResolvedValue(payload);
    const { context, request } = buildContext('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(request.user).toBe(payload);
  });

  it('throws Unauthorized on a protected route with no bearer token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const { context } = buildContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });
});
