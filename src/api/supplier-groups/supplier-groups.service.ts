import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { supplierGroups } from '../../database/schemas';
import { GetSupplierGroupsReqDto } from './dto/get-supplier-groups.req.dto';
import { SupplierGroupResDto } from './dto/supplier-group.res.dto';

@Injectable()
export class SupplierGroupsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getSupplierGroups(
    reqDto: GetSupplierGroupsReqDto,
  ): Promise<OffsetPaginatedDto<SupplierGroupResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(
            unaccentILike(supplierGroups.code, keyword),
            unaccentILike(supplierGroups.name, keyword),
          )
        : undefined,
    );
    const orderBy = desc(supplierGroups.createdAt);

    const [entities, [{ total }]] = await Promise.all([
      this.db.query.supplierGroups.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: count() }).from(supplierGroups).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(SupplierGroupResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }
}
