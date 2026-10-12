import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { AllConfigType } from '../../config/config.type';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationOrdersController } from './integration-orders.controller';
import { IntegrationOrdersService } from './integration-orders.service';
import { IntegrationProductionController } from './integration-production.controller';
import { IntegrationProductionService } from './integration-production.service';
import { IntegrationPurchasingController } from './integration-purchasing.controller';
import { IntegrationPurchasingService } from './integration-purchasing.service';
import { IntegrationQualityController } from './integration-quality.controller';
import { IntegrationQualityService } from './integration-quality.service';
import { IntegrationQueryService } from './integration-query.service';

const ONE_MINUTE_MS = 60_000;

/**
 * Cổng đọc-chỉ cho hệ thống ngoài (AI platform): mỗi route một phép truy vấn nghiệp vụ cố định,
 * xác thực bằng API key riêng, có giới hạn tốc độ. Hợp đồng là OpenAPI của nhóm `Integration`.
 * Throttler chỉ gắn bằng `@UseGuards` ở controller của nhóm này, không phải guard toàn cục.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => ({
        throttlers: [
          {
            ttl: ONE_MINUTE_MS,
            limit: configService.getOrThrow('integration.rateLimitPerMinute', {
              infer: true,
            }),
          },
        ],
      }),
    }),
  ],
  controllers: [
    IntegrationOrdersController,
    IntegrationProductionController,
    IntegrationPurchasingController,
    IntegrationQualityController,
  ],
  providers: [
    IntegrationQueryService,
    IntegrationOrdersService,
    IntegrationProductionService,
    IntegrationPurchasingService,
    IntegrationQualityService,
    IntegrationApiKeyGuard,
  ],
})
export class IntegrationModule {}
