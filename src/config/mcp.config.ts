import { registerAs } from '@nestjs/config';
import {
  IsInt,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { McpConfig } from './mcp-config.type';
import validateConfig from '../utils/validate-config';

const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;

// `KEY=` để trống trong `.env` đọc ra chuỗi rỗng chứ không phải `undefined`, nên
// `@IsOptional()` không đủ: dùng `@ValidateIf` để biến trống là "tắt" (key) hoặc "mặc định" (hạn mức)
class EnvironmentVariablesValidator {
  // Khoá ngắn dễ đoán thì không có giá trị bảo vệ: bắt buộc từ 32 ký tự khi đã đặt
  @ValidateIf((env: EnvironmentVariablesValidator) => !!env.MCP_API_KEY)
  @IsString()
  @MinLength(32)
  MCP_API_KEY?: string;

  @ValidateIf(
    (env: EnvironmentVariablesValidator) => !!env.MCP_RATE_LIMIT_PER_MINUTE,
  )
  @IsInt()
  @Min(1)
  @Max(6000)
  MCP_RATE_LIMIT_PER_MINUTE?: number;
}

export default registerAs<McpConfig>('mcp', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    apiKey: process.env.MCP_API_KEY || undefined,
    rateLimitPerMinute: process.env.MCP_RATE_LIMIT_PER_MINUTE
      ? parseInt(process.env.MCP_RATE_LIMIT_PER_MINUTE, 10)
      : DEFAULT_RATE_LIMIT_PER_MINUTE,
  };
});
