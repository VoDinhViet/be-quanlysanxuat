import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { departments } from '../../database/schemas';
import { DepartmentResDto } from './dto/department.res.dto';
import { GetDepartmentsReqDto } from './dto/get-departments.req.dto';

@Injectable()
export class DepartmentsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getDepartments(
    reqDto: GetDepartmentsReqDto,
  ): Promise<OffsetPaginatedDto<DepartmentResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(unaccentILike(departments.code, keyword), unaccentILike(departments.name, keyword))
        : undefined,
    );
    const orderBy = desc(departments.createdAt);

    const [entities, countRows] = await Promise.all([
      this.db.query.departments.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: count() }).from(departments).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(DepartmentResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
