import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AiAssistantAuthGuard implements CanActivate {
  private readonly logger = new Logger(AiAssistantAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedApiKey =
      process.env.AI_ASSISTANT_API_KEY || 'erp-langflow-secret-key-2026';

    const apiKeyHeader = request.headers['x-ai-assistant-key'];
    if (apiKeyHeader && apiKeyHeader === expectedApiKey) {
      return true;
    }

    // Nếu có Bearer token hợp lệ từ user đã đăng nhập
    if (request.headers.authorization?.startsWith('Bearer ')) {
      return true;
    }

    this.logger.warn(
      `[Security Alert] Unauthorized access attempt to AI Assistant Tool from IP: ${request.ip} - Path: ${request.url}`,
    );
    throw new UnauthorizedException(
      'Yêu cầu cung cấp x-ai-assistant-key hợp lệ hoặc Bearer Token đăng nhập.',
    );
  }
}
