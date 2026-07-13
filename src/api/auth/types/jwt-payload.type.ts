export type JwtPayloadType = {
  sub: string;
  username: string;
  email: string;
  sessionId: string;
  iat: number;
  exp: number;
};
