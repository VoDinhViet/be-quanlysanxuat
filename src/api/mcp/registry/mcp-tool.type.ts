import type { Type } from '@nestjs/common';
import type { z } from 'zod';

import {
  type PermissionCode,
  SUPER_PERMISSION,
} from '../../../constants/permission.constant';
import type { McpDomain } from '../mcp.constant';
import type { McpCaller } from '../types/mcp-caller.type';
import type { HandlerArg } from './handler-args';

export interface McpTool {
  name: string;
  title: string;
  description: string;
  domain: McpDomain;
  // Lấy từ `@Permissions` của route, cùng nguồn với `PermissionsGuard`
  permissions: PermissionCode[];
  inputSchema: z.ZodObject<z.ZodRawShape>;
  controller: Type<object>;
  method: string;
  handlerArgs: HandlerArg[];
}

export function canUseTool(tool: McpTool, caller: McpCaller): boolean {
  return (
    caller.permissionCodes.includes(SUPER_PERMISSION) ||
    tool.permissions.every((permission) =>
      caller.permissionCodes.includes(permission),
    )
  );
}
