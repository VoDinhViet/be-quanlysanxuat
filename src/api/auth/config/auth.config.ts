import { registerAs } from '@nestjs/config';
import { IsOptional, IsString } from 'class-validator';
import type { StringValue } from 'ms';

import validateConfig from '../../../utils/validate-config';
import { AuthConfig } from './auth-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  AUTH_JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  AUTH_JWT_TOKEN_EXPIRES_IN?: string;

  @IsString()
  AUTH_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  AUTH_REFRESH_TOKEN_EXPIRES_IN?: string;
}

export default registerAs<AuthConfig>('auth', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    jwtSecret: process.env.AUTH_JWT_SECRET!,
    jwtTokenExpiresIn: (process.env.AUTH_JWT_TOKEN_EXPIRES_IN || '7d') as StringValue,
    refreshSecret: process.env.AUTH_REFRESH_SECRET!,
    refreshTokenExpiresIn: (process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN || '7d') as StringValue,
  };
});
