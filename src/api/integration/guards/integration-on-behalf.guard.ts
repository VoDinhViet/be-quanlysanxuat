import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  type PermissionCode,
  SUPER_PERMISSION,
} from '../../../constants/permission.constant';
import { ErrorCode } from '../../../constants/error-code.constant';
import {
  PERMISSIONS_BY_PARAM_KEY,
  PERMISSIONS_KEY,
  type PermissionsByParamRule,
} from '../../../decorators/permissions.decorator';
import { AppException } from '../../../exceptions/app.exception';
import { PermissionsService } from '../../auth/permissions.service';
import { StatusCountEntity } from '../dto/integration-orders.req.dto';

// Header AI platform gửi khi hỏi thay một người dùng ERP: giá trị là credentialId của họ
export const ON_BEHALF_OF_HEADER = 'x-on-behalf-of';

// `count-by-status` dùng chung một route cho nhiều thực thể nên quyền theo tham số `entity`
const ENTITY_PERMISSIONS: Record<StatusCountEntity, PermissionCode> = {
  [StatusCountEntity.ORDERS]: 'orders:read',
  [StatusCountEntity.PRODUCTION_JOBS]: 'production:read',
  [StatusCountEntity.PRODUCTION_ORDERS]: 'production:read',
  [StatusCountEntity.PAYMENT_REQUESTS]: 'purchasing:read',
  [StatusCountEntity.INVENTORY_RECEIPTS]: 'inventory:read',
};

const CREDENTIAL_ID_PATTERN = /^[0-9a-f-]{36}$/i;

/**
 * Chạy sau `IntegrationApiKeyGuard`. Không có header `X-On-Behalf-Of` thì giữ hành vi cũ (Ask
 * nội bộ của quản trị, chỉ cần khoá máy). Có header thì chỉ cho qua khi vai trò của credential đó
 * có quyền route yêu cầu (`@Permissions`) hoặc quyền toàn hệ thống. Route không khai quyền, hoặc
 * thực thể lạ, bị từ chối: mặc định là đóng.
 */
@Injectable()
export class IntegrationOnBehalfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const credentialId = request.header(ON_BEHALF_OF_HEADER);
    if (credentialId === undefined) {
      return true;
    }
    if (!CREDENTIAL_ID_PATTERN.test(credentialId)) {
      throw new AppException(ErrorCode.E033, HttpStatus.FORBIDDEN);
    }

    const required = this.resolveRequired(context, request);
    const granted =
      await this.permissionsService.getPermissionCodes(credentialId);
    const isAllowed =
      granted.includes(SUPER_PERMISSION) ||
      (required.length > 0 &&
        required.every((permission) => granted.includes(permission)));
    if (!isAllowed) {
      throw new AppException(ErrorCode.E033, HttpStatus.FORBIDDEN);
    }

    return true;
  }

  private resolveRequired(
    context: ExecutionContext,
    request: Request,
  ): PermissionCode[] {
    const targets = [context.getHandler(), context.getClass()];
    const declared =
      this.reflector.getAllAndOverride<PermissionCode[]>(
        PERMISSIONS_KEY,
        targets,
      ) ?? [];
    const byParam = this.reflector.getAllAndOverride<PermissionsByParamRule>(
      PERMISSIONS_BY_PARAM_KEY,
      targets,
    );
    if (byParam) {
      const value = request.query[byParam.param];
      const paramPermission =
        typeof value === 'string'
          ? byParam.permissionByValue[value]
          : undefined;
      // Route khai quyền theo tham số mà giá trị lạ: không cấp quyền nào, bị từ chối (mặc định đóng)
      return paramPermission ? [...declared, ...[paramPermission].flat()] : [];
    }
    if (declared.length > 0) {
      return declared;
    }

    const entity = request.query.entity;
    const entityPermission =
      typeof entity === 'string'
        ? ENTITY_PERMISSIONS[entity as StatusCountEntity]
        : undefined;

    return entityPermission ? [entityPermission] : [];
  }
}
