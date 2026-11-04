import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { AllConfigType } from '../../../config/config.type';
import { secureCompare } from '../../../common/utils/secure-compare';
import { MCP_API_KEY_HEADER } from '../mcp.constant';

/**
 * Xác thực máy-với-máy cho `/api/mcp`: một access key trong env, tách khỏi JWT người dùng.
 * Key chưa đặt thì mọi request bị từ chối (endpoint coi như tắt), không có đường vào khác.
 */
@Injectable()
export class McpApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(McpApiKeyGuard.name);

  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedKey = this.configService.get('mcp.apiKey', { infer: true });
    if (!expectedKey) {
      this.logger.warn('mcp_disabled: MCP_API_KEY chưa đặt');
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.header(MCP_API_KEY_HEADER);
    if (!providedKey || !secureCompare(providedKey, expectedKey)) {
      this.logger.warn(`mcp_api_key_rejected ip=${request.ip}`);
      throw new UnauthorizedException();
    }

    return true;
  }
}
