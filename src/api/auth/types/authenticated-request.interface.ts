import type { Request } from 'express';

import type { JwtPayloadType } from './jwt-payload.type';

export interface AuthenticatedRequest extends Request {
  user: JwtPayloadType;
}
