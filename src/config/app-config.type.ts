import { Environment } from '../constants/app.constant';

export type AppConfig = {
  nodeEnv: Environment;
  name: string;
  workingDirectory: string;
  frontendDomain?: string;
  backendDomain: string;
  port: number;
  apiPrefix: string;
  fallbackLanguage: string;
  headerLanguage: string;
  corsOrigin: string | boolean | RegExp | (string | RegExp)[];
};
