import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { clientGroups } from '../../database/schemas';
import { ClientGroupResDto } from './dto/client-group.res.dto';
import { GetClientGroupsReqDto } from './dto/get-client-groups.req.dto';

@Injectable()
export class ClientGroupsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getClientGroups(
    reqDto: GetClientGroupsReqDto,
  ): Promise<OffsetPaginatedDto<ClientGroupResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(unaccentILike(clientGroups.code, keyword), unaccentILike(clientGroups.name, keyword))
        : undefined,
    );
    const orderBy = desc(clientGroups.createdAt);

    const [entities, count] = await Promise.all([
      this.db.query.clientGroups.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: drizzleCount() }).from(clientGroups).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ClientGroupResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }
}
