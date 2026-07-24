import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, inArray, or } from 'drizzle-orm';

import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { units, unitScopes } from '../../database/schemas';
import { GetUnitsReqDto } from './dto/get-units.req.dto';
import { UnitResDto } from './dto/unit.res.dto';

@Injectable()
export class UnitsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Returns the whole catalogue — see `GetUnitsReqDto` for why this isn't paginated. */
  async getUnits(reqDto: GetUnitsReqDto): Promise<UnitResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.units.findMany({
      where: and(
        keyword
          ? or(
              unaccentILike(units.code, keyword),
              unaccentILike(units.name, keyword),
            )
          : undefined,
        reqDto.scope
          ? inArray(
              units.id,
              this.db
                .select({ id: unitScopes.unitId })
                .from(unitScopes)
                .where(eq(unitScopes.scope, reqDto.scope)),
            )
          : undefined,
      ),
      // Alphabetical, because this list is rendered straight into a dropdown.
      orderBy: asc(units.name),
    });

    return plainToInstance(UnitResDto, entities, {
      excludeExtraneousValues: true,
    });
  }
}
