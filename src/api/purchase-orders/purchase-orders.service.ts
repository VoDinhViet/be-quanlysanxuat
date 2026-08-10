import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, exists, gte, lt, or, sql } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  items,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
} from '../../database/schemas';
import { GetPurchaseOrdersReqDto } from './dto/get-purchase-orders.req.dto';
import { PagePurchaseOrderResDto } from './dto/page-purchase-order.res.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPurchaseOrders(
    reqDto: GetPurchaseOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PagePurchaseOrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(purchaseOrders.code, keyword) : undefined,
      reqDto.supplierId
        ? eq(purchaseOrders.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.status ? eq(purchaseOrders.status, reqDto.status) : undefined,
      reqDto.purchaseRequestId || materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseOrderItems)
              .innerJoin(
                purchaseRequestItems,
                eq(
                  purchaseRequestItems.id,
                  purchaseOrderItems.purchaseRequestItemId,
                ),
              )
              .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
              .where(
                and(
                  eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id),
                  reqDto.purchaseRequestId
                    ? eq(
                        purchaseRequestItems.purchaseRequestId,
                        reqDto.purchaseRequestId,
                      )
                    : undefined,
                  materialKeyword
                    ? or(
                        unaccentILike(items.name, materialKeyword),
                        unaccentILike(items.code, materialKeyword),
                      )
                    : undefined,
                ),
              ),
          )
        : undefined,
      reqDto.fromDate
        ? gte(purchaseOrders.orderDate, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            purchaseOrders.orderDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.purchaseOrders.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(purchaseOrders.createdAt),
        with: {
          supplier: true,
          ordererBy: true,
          cancellerBy: true,
          creatorBy: true,
          items: {
            with: {
              purchaseRequestItem: {
                with: { purchaseRequest: true, item: { with: { unit: true } } },
              },
            },
          },
        },
      }),
      this.db.select({ total: count() }).from(purchaseOrders).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PagePurchaseOrderResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
