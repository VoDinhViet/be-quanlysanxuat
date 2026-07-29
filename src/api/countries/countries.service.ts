import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { asc, or } from 'drizzle-orm';

import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { countries } from '../../database/schemas';
import { CountryResDto } from './dto/country.res.dto';
import { GetCountriesReqDto } from './dto/get-countries.req.dto';

@Injectable()
export class CountriesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Returns the whole catalogue — see `GetCountriesReqDto` for why this isn't paginated. */
  async getCountries(reqDto: GetCountriesReqDto): Promise<CountryResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.countries.findMany({
      where: keyword
        ? or(
            unaccentILike(countries.code, keyword),
            unaccentILike(countries.name, keyword),
          )
        : undefined,
      // Alphabetical, because this list is rendered straight into a dropdown.
      orderBy: asc(countries.name),
    });

    return plainToInstance(CountryResDto, entities, {
      excludeExtraneousValues: true,
    });
  }
}
