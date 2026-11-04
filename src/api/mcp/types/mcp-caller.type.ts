import type { Request } from 'express';

import type { PermissionCode } from '../../../constants/permission.constant';
import type { JwtPayloadType } from '../../auth/types/jwt-payload.type';

// Nhân viên mà agent đang hỏi thay: mọi quyền và dữ liệu theo người này, không theo access key
export interface McpCaller {
  credentialId: string;
  permissionCodes: PermissionCode[];
  // Dạng JWT mà `@CurrentUser()` của controller mong đợi; không phải token thật
  jwtPayload: JwtPayloadType;
}

export type McpRequest = Request & { mcpCaller?: McpCaller };
