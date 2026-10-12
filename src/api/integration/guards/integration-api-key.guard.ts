import { createHash, timingSafeEqual } from 'crypto';

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

// Cùng tên header với `addApiKey` ở Swagger (`Api-Key`); Express so tên header không phân biệt hoa thường
export const INTEGRATION_API_KEY_HEADER = 'api-key';

// So hai chuỗi qua SHA-256 để độ dài bằng nhau: `timingSafeEqual` không rò thời gian theo nội dung
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Xác thực máy-với-máy cho nhóm `/integration`: một khoá riêng trong env, tách khỏi JWT người
 * dùng. Khoá chưa đặt thì mọi request bị từ chối (nhóm route coi như tắt), không có đường vào
 * khác ngoài khoá.
 */
@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(IntegrationApiKeyGuard.name);

  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedKey = this.configService.get('integration.apiKey', {
      infer: true,
    });
    if (!expectedKey) {
      this.logger.warn(
        'integration_api_disabled: INTEGRATION_API_KEY chưa đặt',
      );
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.header(INTEGRATION_API_KEY_HEADER);
    const isKeyValid =
      !!providedKey &&
      timingSafeEqual(digest(providedKey), digest(expectedKey));
    if (!isKeyValid) {
      this.logger.warn(`integration_api_key_rejected ip=${request.ip}`);
      throw new UnauthorizedException();
    }

    return true;
  }
}
