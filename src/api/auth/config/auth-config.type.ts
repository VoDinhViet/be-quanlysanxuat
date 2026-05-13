import { StringValue } from 'ms';

export type AuthConfig = {
  confirmEmailExpires: StringValue;
  secret: string;
  expires: StringValue;
  refreshSecret: string;
  refreshExpires: StringValue;
};
