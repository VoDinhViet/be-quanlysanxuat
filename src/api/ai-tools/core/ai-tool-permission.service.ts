import type { RunnableConfig } from '@langchain/core/runnables';
import { Injectable } from '@nestjs/common';

import {
  SUPER_PERMISSION,
  type PermissionCode,
} from '../../../constants/permission.constant';
import { PermissionsService } from '../../auth/permissions.service';
import { getUserIdFromConfig } from './ai-tool.context';
import { createForbiddenToolError } from './ai-tool.error';

export function isPermissionGranted(
  grantedCodes: readonly PermissionCode[],
  requiredCode: PermissionCode,
): boolean {
  return (
    grantedCodes.includes(SUPER_PERMISSION) ||
    grantedCodes.includes(requiredCode)
  );
}

/** Services never check permissions themselves (controllers do), so every tool that reads through a
 * service must go through here first — otherwise the chatbot would read past the user's role. */
@Injectable()
export class AiToolPermissionService {
  constructor(private readonly permissionsService: PermissionsService) {}

  loadGrantedCodes(userId: string): Promise<PermissionCode[]> {
    return this.permissionsService.getPermissionCodes(userId);
  }

  /** Returns `null` when allowed, otherwise the `FORBIDDEN` payload the tool should return as-is. */
  async checkPermission(
    userId: string,
    requiredCode: PermissionCode,
  ): Promise<string | null> {
    const grantedCodes = await this.loadGrantedCodes(userId);
    return isPermissionGranted(grantedCodes, requiredCode)
      ? null
      : createForbiddenToolError();
  }

  /** Wraps a tool handler so it only runs when the asking user holds `requiredCode`; otherwise the
   * tool returns the `FORBIDDEN` payload and the handler (and its service call) never runs. */
  withPermission<TInput>(
    requiredCode: PermissionCode,
    handler: (input: TInput) => Promise<string>,
  ): (input: TInput, config: RunnableConfig) => Promise<string> {
    return async (input, config) => {
      const denied = await this.checkPermission(
        getUserIdFromConfig(config),
        requiredCode,
      );
      return denied ?? handler(input);
    };
  }
}
