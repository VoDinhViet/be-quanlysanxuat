import { registerAs } from '@nestjs/config';
import { DatabaseConfig } from './database-config.type';
import validateConfig from '../../utils/validate-config';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

const databaseSslModes = ['false', 'true', 'require', 'allow', 'prefer', 'verify-full'] as const;

function parseDatabaseSslMode(sslMode?: (typeof databaseSslModes)[number]): DatabaseConfig['ssl'] {
  if (!sslMode || sslMode === 'false') {
    return undefined;
  }

  if (sslMode === 'true') {
    return true;
  }

  return sslMode;
}

class EnvironmentVariablesValidator {
  @IsString()
  DATABASE_URL: string;

  @IsOptional()
  @IsNumber()
  DATABASE_MAX_CONNECTIONS: number;

  @IsOptional()
  @IsIn(databaseSslModes)
  DATABASE_SSL_MODE?: (typeof databaseSslModes)[number];
}

export default registerAs<DatabaseConfig>('database', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    url: process.env.DATABASE_URL as string,
    maxConnections: process.env.DATABASE_MAX_CONNECTIONS
      ? parseInt(process.env.DATABASE_MAX_CONNECTIONS, 10)
      : undefined,
    ssl: parseDatabaseSslMode(process.env.DATABASE_SSL_MODE as (typeof databaseSslModes)[number]),
  };
});
