import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../constants/role.constant';
import { JwtPayloadType } from '../api/auth/types/jwt-payload.type';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayloadType | undefined;

    if (!user) {
      return false;
    }

    if (!requiredRoles.includes(user.role as Role)) {
      throw new ForbiddenException(
        'Ban khong co quyen truy cap tai nguyen nay',
      );
    }

    return true;
  }
}
