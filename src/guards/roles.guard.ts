import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';

import { JwtPayloadType } from '../api/auth/types/jwt-payload.type';
import type { PermissionCode } from '../constants/permission.constant';
import { Role } from '../constants/role.constant';
import { DRIZZLE } from '../database/database.module';
import type { Database } from '../database/database.type';
import { roles } from '../database/schemas';
import { AuthenticatedRequest } from '../api/auth/types/authenticated-request.interface';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length && !requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user as JwtPayloadType | undefined;

    if (!user?.role) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    if (
      requiredPermissions?.length &&
      !(await this.hasPermissions(user.role, requiredPermissions))
    ) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }

  private async hasPermissions(
    roleCode: Role,
    requiredPermissions: PermissionCode[],
  ): Promise<boolean> {
    const role = await this.db.query.roles.findFirst({
      where: eq(roles.code, roleCode),
      with: {
        rolePermissions: {
          with: {
            permission: true,
          },
        },
      },
    });

    if (!role || !role.isActive) {
      return false;
    }

    const permissions = new Set(
      role.rolePermissions
        .map((rolePermission) => rolePermission.permission)
        .map((permission) => permission.code),
    );

    if (permissions.has('system:manage')) {
      return true;
    }

    return requiredPermissions.every((permission) => permissions.has(permission));
  }
}
