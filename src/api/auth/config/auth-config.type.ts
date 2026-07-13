import type { StringValue } from 'ms';

export type AuthConfig = {
  jwtSecret: string;
  jwtTokenExpiresIn: StringValue;
  refreshSecret: string;
  refreshTokenExpiresIn: StringValue;
};
