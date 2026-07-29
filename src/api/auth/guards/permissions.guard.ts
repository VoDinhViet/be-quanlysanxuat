import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PERMISSIONS_KEY } from '../../../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../../../decorators/public.decorator';
import {
  type PermissionCode,
  SUPER_PERMISSION,
} from '../../../constants/permission.constant';
import { ErrorCode } from '../../../constants/error-code.constant';
import { AppException } from '../../../exceptions/app.exception';
import { PermissionsService } from '../permissions.service';
import type { JwtPayloadType } from '../types/jwt-payload.type';

/**
 * Authorization guard, registered globally right after `JwtAuthGuard`. It reads the
 * `@Permissions(...)` metadata a route declares and checks the authenticated user's effective
 * permission set (loaded/cached by `PermissionsService`).
 *
 * Rules:
 * - `@Public()` routes are skipped (they never reach authentication either).
 * - Routes with no `@Permissions(...)` only need a valid session — being authenticated passes.
 * - A user holding `system:manage` (Super Admin) passes every check.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayloadType }>();
    const user = request.user;

    if (!user?.sub) {
      throw new UnauthorizedException();
    }

    const granted = await this.permissionsService.getPermissionCodes(user.sub);

    if (granted.includes(SUPER_PERMISSION)) {
      return true;
    }

    const hasAll = required.every((permission) => granted.includes(permission));

    if (!hasAll) {
      throw new AppException(ErrorCode.E033, HttpStatus.FORBIDDEN);
    }

    return true;
  }
}
