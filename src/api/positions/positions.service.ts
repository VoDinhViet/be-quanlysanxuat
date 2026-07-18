import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { positions } from '../../database/schemas';
import { GetPositionsReqDto } from './dto/get-positions.req.dto';
import { PositionResDto } from './dto/position.res.dto';

@Injectable()
export class PositionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPositions(reqDto: GetPositionsReqDto): Promise<OffsetPaginatedDto<PositionResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(unaccentILike(positions.code, keyword), unaccentILike(positions.name, keyword))
        : undefined,
    );
    const orderBy = desc(positions.createdAt);

    const [entities, count] = await Promise.all([
      this.db.query.positions.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: drizzleCount() }).from(positions).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PositionResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }
}
