import { registerAs } from '@nestjs/config';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import { IntegrationConfig } from './integration-config.type';
import validateConfig from '../utils/validate-config';

const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

class EnvironmentVariablesValidator {
  // Khoá ngắn dễ đoán thì không có giá trị bảo vệ: bắt buộc từ 32 ký tự khi đã đặt
  @IsString()
  @MinLength(32)
  @IsOptional()
  INTEGRATION_API_KEY?: string;

  @IsInt()
  @Min(1)
  @Max(6000)
  @IsOptional()
  INTEGRATION_RATE_LIMIT_PER_MINUTE?: number;

  @IsInt()
  @Min(1000)
  @Max(60_000)
  @IsOptional()
  INTEGRATION_QUERY_TIMEOUT_MS?: number;
}

export default registerAs<IntegrationConfig>('integration', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    apiKey: process.env.INTEGRATION_API_KEY || undefined,
    rateLimitPerMinute: process.env.INTEGRATION_RATE_LIMIT_PER_MINUTE
      ? parseInt(process.env.INTEGRATION_RATE_LIMIT_PER_MINUTE, 10)
      : DEFAULT_RATE_LIMIT_PER_MINUTE,
    queryTimeoutMs: process.env.INTEGRATION_QUERY_TIMEOUT_MS
      ? parseInt(process.env.INTEGRATION_QUERY_TIMEOUT_MS, 10)
      : DEFAULT_QUERY_TIMEOUT_MS,
  };
});
