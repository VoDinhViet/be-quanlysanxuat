import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { materialGroups } from '../../database/schemas';
import { GetMaterialGroupsReqDto } from './dto/get-material-groups.req.dto';
import { MaterialGroupResDto } from './dto/material-group.res.dto';

@Injectable()
export class MaterialGroupsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getMaterialGroups(
    reqDto: GetMaterialGroupsReqDto,
  ): Promise<OffsetPaginatedDto<MaterialGroupResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(
            unaccentILike(materialGroups.code, keyword),
            unaccentILike(materialGroups.name, keyword),
          )
        : undefined,
    );
    const orderBy = desc(materialGroups.createdAt);

    const [entities, countRows] = await Promise.all([
      this.db.query.materialGroups.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: count() }).from(materialGroups).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(MaterialGroupResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
