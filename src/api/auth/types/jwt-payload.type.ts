import { Role } from '../../../constants/role.constant';

export type JwtPayloadType = {
  sub: string;
  email?: string;
  role?: Role;
};
