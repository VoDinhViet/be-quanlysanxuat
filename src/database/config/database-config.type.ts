export type DatabaseConfig = {
  url: string;
  maxConnections?: number;
  ssl?: boolean | 'require' | 'allow' | 'prefer' | 'verify-full';
};
