import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { productGroups } from '../../database/schemas';
import { GetProductGroupsReqDto } from './dto/get-product-groups.req.dto';
import { ProductGroupResDto } from './dto/product-group.res.dto';

@Injectable()
export class ProductGroupsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getProductGroups(
    reqDto: GetProductGroupsReqDto,
  ): Promise<OffsetPaginatedDto<ProductGroupResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(
            unaccentILike(productGroups.code, keyword),
            unaccentILike(productGroups.name, keyword),
          )
        : undefined,
    );
    const orderBy = desc(productGroups.createdAt);

    const [entities, countRows] = await Promise.all([
      this.db.query.productGroups.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: count() }).from(productGroups).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductGroupResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
