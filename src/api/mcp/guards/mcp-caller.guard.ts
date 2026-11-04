import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

import { ErrorCode } from '../../../constants/error-code.constant';
import { AppException } from '../../../exceptions/app.exception';
import { AuthService } from '../../auth/auth.service';
import { PermissionsService } from '../../auth/permissions.service';
import { MCP_ON_BEHALF_OF_HEADER } from '../mcp.constant';
import type { McpCaller, McpRequest } from '../types/mcp-caller.type';

const CALLER_TOKEN_TTL_SECONDS = 60;

/**
 * Chạy sau `McpApiKeyGuard`. MCP luôn hỏi thay một nhân viên (không có chế độ admin chỉ cần key):
 * thiếu `X-On-Behalf-Of` là bị từ chối. Credential bị khoá hoặc user đã nghỉ việc bị chặn ngay,
 * không chờ token hết hạn như JWT.
 */
@Injectable()
export class McpCallerGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<McpRequest>();
    const credentialId = request.header(MCP_ON_BEHALF_OF_HEADER);
    // Một chuỗi sai định dạng mà lọt tới cột `uuid` sẽ làm Postgres ném lỗi (500) thay vì 403
    if (!credentialId || !isUUID(credentialId)) {
      throw new AppException(ErrorCode.E033, HttpStatus.FORBIDDEN);
    }

    const [identity, permissionCodes] = await Promise.all([
      this.authService.getActiveCredentialIdentity(credentialId),
      this.permissionsService.getPermissionCodes(credentialId),
    ]);

    const issuedAt = Math.floor(Date.now() / 1000);
    const caller: McpCaller = {
      credentialId: identity.credentialId,
      permissionCodes,
      jwtPayload: {
        sub: identity.credentialId,
        userId: identity.userId,
        username: identity.username,
        email: identity.email,
        sessionId: 'mcp',
        iat: issuedAt,
        exp: issuedAt + CALLER_TOKEN_TTL_SECONDS,
      },
    };
    request.mcpCaller = caller;

    return true;
  }
}
