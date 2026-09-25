import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, eq, or } from 'drizzle-orm';

import { BomsService } from '../boms/boms.service';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { bomItems, BomType, files, items, units } from '../../database/schemas';
import { BomDirectResDto } from './dto/bom-direct.res.dto';
import { GetBomDirectsReqDto } from './dto/get-bom-directs.req.dto';

@Injectable()
export class BomDirectsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly bomsService: BomsService,
  ) {}

  async getBomDirects(
    itemId: string,
    bomItemId: string,
    reqDto: GetBomDirectsReqDto,
  ): Promise<OffsetPaginatedDto<BomDirectResDto>> {
    await this.bomsService.ensureBomItemInBom(itemId, bomItemId);

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(bomItems.parentId, bomItemId),
      eq(bomItems.type, BomType.DIRECT),
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: bomItems.id,
          itemId: bomItems.itemId,
          code: items.code,
          revision: items.revision,
          name: items.name,
          quantity: bomItems.quantity,
          note: bomItems.note,
          image: files,
          unit: units,
        })
        .from(bomItems)
        .innerJoin(items, eq(bomItems.itemId, items.id))
        .leftJoin(units, eq(units.id, items.unitId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .where(where)
        .orderBy(asc(bomItems.sortOrder), asc(bomItems.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(bomItems)
        .innerJoin(items, eq(bomItems.itemId, items.id))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(BomDirectResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }
}
