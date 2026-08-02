export type JwtPayloadType = {
  sub: string;
  userId: string;
  username: string;
  email: string;
  sessionId: string;
  iat: number;
  exp: number;
};
