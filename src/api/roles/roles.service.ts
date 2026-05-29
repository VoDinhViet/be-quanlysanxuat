import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { asc, eq } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { roles } from '../../database/schemas';
import { RoleOptionResDto } from './dto/role-option.res.dto';

@Injectable()
export class RolesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getRoles(): Promise<RoleOptionResDto[]> {
    const roleOptions = await this.db
      .select({
        id: roles.id,
        code: roles.code,
        name: roles.name,
      })
      .from(roles)
      .where(eq(roles.isActive, true))
      .orderBy(asc(roles.name));

    return plainToInstance(RoleOptionResDto, roleOptions);
  }
}
