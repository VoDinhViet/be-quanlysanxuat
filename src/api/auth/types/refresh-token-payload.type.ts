export type RefreshTokenPayloadType = {
  sessionId: string;
  hash: string;
  iat: number;
  exp: number;
};
