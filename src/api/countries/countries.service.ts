import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { countries } from '../../database/schemas';
import { CountryResDto } from './dto/country.res.dto';
import { GetCountriesReqDto } from './dto/get-countries.req.dto';

@Injectable()
export class CountriesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getCountries(
    reqDto: GetCountriesReqDto,
  ): Promise<OffsetPaginatedDto<CountryResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(
            unaccentILike(countries.code, keyword),
            unaccentILike(countries.name, keyword),
          )
        : undefined,
    );
    const orderBy = desc(countries.createdAt);

    const [entities, countRows] = await Promise.all([
      this.db.query.countries.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: count() }).from(countries).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(CountryResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
