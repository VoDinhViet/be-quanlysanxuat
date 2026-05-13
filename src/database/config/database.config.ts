import { registerAs } from '@nestjs/config';
import { DatabaseConfig } from './database-config.type';
import validateConfig from '../../utils/validate-config';
import { IsOptional, IsString, IsNumber } from 'class-validator';

class EnvironmentVariablesValidator {
  @IsString()
  DATABASE_URL: string;

  @IsOptional()
  @IsNumber()
  DATABASE_MAX_CONNECTIONS: number;
}

export default registerAs<DatabaseConfig>('database', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    url: process.env.DATABASE_URL as string,
    maxConnections: process.env.DATABASE_MAX_CONNECTIONS
      ? parseInt(process.env.DATABASE_MAX_CONNECTIONS, 10)
      : undefined,
  };
});
