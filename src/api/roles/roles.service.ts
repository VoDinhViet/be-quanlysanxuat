import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, desc, isNull, or } from 'drizzle-orm';

import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { roles } from '../../database/schemas';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { RoleResDto } from './dto/role.res.dto';

@Injectable()
export class RolesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getRoles(reqDto: GetRolesReqDto): Promise<RoleResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.roles.findMany({
      where: and(
        isNull(roles.deletedAt),
        keyword
          ? or(
              unaccentILike(roles.code, keyword),
              unaccentILike(roles.name, keyword),
            )
          : undefined,
      ),
      orderBy: desc(roles.createdAt),
    });

    return plainToInstance(RoleResDto, entities, {
      excludeExtraneousValues: true,
    });
  }
}
