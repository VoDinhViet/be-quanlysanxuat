import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, exists, gte, lte, or, sql } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  materials,
  purchaseRequestItems,
  purchaseRequests,
} from '../../database/schemas';
import { GetPurchaseRequestsReqDto } from './dto/get-purchase-requests.req.dto';
import { PurchaseRequestResDto } from './dto/purchase-request.res.dto';

@Injectable()
export class PurchaseRequestsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPurchaseRequests(
    reqDto: GetPurchaseRequestsReqDto,
  ): Promise<OffsetPaginatedDto<PurchaseRequestResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(purchaseRequests.code, keyword) : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseRequestItems)
              .innerJoin(
                materials,
                eq(materials.id, purchaseRequestItems.materialId),
              )
              .where(
                and(
                  eq(
                    purchaseRequestItems.purchaseRequestId,
                    purchaseRequests.id,
                  ),
                  or(
                    unaccentILike(materials.name, materialKeyword),
                    unaccentILike(materials.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      reqDto.productionOrderId
        ? eq(purchaseRequests.productionOrderId, reqDto.productionOrderId)
        : undefined,
      reqDto.requesterId
        ? eq(purchaseRequests.createdBy, reqDto.requesterId)
        : undefined,
      reqDto.departmentId
        ? eq(purchaseRequests.departmentId, reqDto.departmentId)
        : undefined,
      reqDto.status ? eq(purchaseRequests.status, reqDto.status) : undefined,
      reqDto.neededDate
        ? eq(purchaseRequests.neededDate, reqDto.neededDate)
        : undefined,
      reqDto.fromDate
        ? gte(purchaseRequests.createdAt, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lte(purchaseRequests.createdAt, reqDto.toDate)
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.purchaseRequests.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(purchaseRequests.createdAt),
        with: { department: true, requester: true, productionOrder: true },
      }),
      this.db.select({ total: count() }).from(purchaseRequests).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PurchaseRequestResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
