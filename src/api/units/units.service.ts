import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { units } from '../../database/schemas';
import { GetUnitsReqDto } from './dto/get-units.req.dto';
import { UnitResDto } from './dto/unit.res.dto';

@Injectable()
export class UnitsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getUnits(reqDto: GetUnitsReqDto): Promise<OffsetPaginatedDto<UnitResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(unaccentILike(units.code, keyword), unaccentILike(units.name, keyword))
        : undefined,
    );
    const orderBy = desc(units.createdAt);

    const [entities, count] = await Promise.all([
      this.db.query.units.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: drizzleCount() }).from(units).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(UnitResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }
}
