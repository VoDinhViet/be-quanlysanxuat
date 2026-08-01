import {
  ExecutionContext,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode } from '../../../constants/error-code.constant';
import type { PermissionCode } from '../../../constants/permission.constant';
import { IS_PUBLIC_KEY } from '../../../decorators/public.decorator';
import { PermissionsService } from '../permissions.service';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let permissionsService: { getPermissionCodes: jest.Mock };

  const buildContext = (user?: { sub: string }): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  // Reflector.getAllAndOverride is called for IS_PUBLIC_KEY then PERMISSIONS_KEY.
  const setReflector = (isPublic: boolean, required?: PermissionCode[]) => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? isPublic : required,
    );
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    permissionsService = { getPermissionCodes: jest.fn() };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      permissionsService as unknown as PermissionsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows public routes without loading permissions', async () => {
    setReflector(true);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(permissionsService.getPermissionCodes).not.toHaveBeenCalled();
  });

  it('allows routes that declare no permissions (auth is enough)', async () => {
    setReflector(false, undefined);

    await expect(
      guard.canActivate(buildContext({ sub: 'cred-1' })),
    ).resolves.toBe(true);
    expect(permissionsService.getPermissionCodes).not.toHaveBeenCalled();
  });

  it('allows a user holding the super permission (system:manage)', async () => {
    setReflector(false, ['users:create']);
    permissionsService.getPermissionCodes.mockResolvedValue(['system:manage']);

    await expect(
      guard.canActivate(buildContext({ sub: 'cred-1' })),
    ).resolves.toBe(true);
  });

  it('allows a user holding every required permission', async () => {
    setReflector(false, ['users:create']);
    permissionsService.getPermissionCodes.mockResolvedValue([
      'roles:read',
      'users:create',
    ]);

    await expect(
      guard.canActivate(buildContext({ sub: 'cred-1' })),
    ).resolves.toBe(true);
  });

  it('throws E033 (403) when the user is missing a required permission', async () => {
    setReflector(false, ['users:update']);
    permissionsService.getPermissionCodes.mockResolvedValue(['roles:read']);

    await expect(
      guard.canActivate(buildContext({ sub: 'cred-1' })),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { errorCode: ErrorCode.E033 },
    });
  });

  it('throws Unauthorized when a protected route has no authenticated user', async () => {
    setReflector(false, ['roles:read']);

    await expect(
      guard.canActivate(buildContext(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
