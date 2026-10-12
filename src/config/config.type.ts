import { AppConfig } from './app-config.type';
import { IntegrationConfig } from './integration-config.type';
import { UploadConfig } from './upload-config.type';
import { AuthConfig } from '../api/auth/config/auth-config.type';
import { DatabaseConfig } from '../database/config/database-config.type';
import { RedisConfig } from '../redis/redis-config.type';

export type AllConfigType = {
  app: AppConfig;
  auth: AuthConfig;
  database: DatabaseConfig;
  integration: IntegrationConfig;
  redis: RedisConfig;
  upload: UploadConfig;
};
