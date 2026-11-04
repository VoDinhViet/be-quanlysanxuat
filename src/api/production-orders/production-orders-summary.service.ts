import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import { asText, dateRangeConditions } from '../../common/summary/summary.sql';
import { vnTimestamp } from '../../common/utils/time';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  orders,
  productionOrders,
  ProductionOrderStatus,
} from '../../database/schemas';
import { GetOpenProductionOrdersReqDto } from './dto/get-open-production-orders.req.dto';
import { GetProductionOrderStatusStatsReqDto } from './dto/get-production-order-status-stats.req.dto';
import { OpenProductionOrderResDto } from './dto/open-production-order.res.dto';
import { ProductionOrderStatusStatResDto } from './dto/production-order-status-stat.res.dto';

@Injectable()
export class ProductionOrdersSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOpenProductionOrders(
    reqDto: GetOpenProductionOrdersReqDto,
  ): Promise<OpenProductionOrderResDto[]> {
    const openProductionOrders = await this.db
      .select({
        id: productionOrders.id,
        code: productionOrders.code,
        orderCode: orders.code,
        status: asText(productionOrders.status),
      })
      .from(productionOrders)
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .where(
        and(
          ne(productionOrders.status, ProductionOrderStatus.COMPLETED),
          isNull(orders.deletedAt),
        ),
      )
      .orderBy(asc(productionOrders.code))
      .limit(limitOf(reqDto));

    return plainToInstance(OpenProductionOrderResDto, openProductionOrders, {
      excludeExtraneousValues: true,
    });
  }

  async getProductionOrderStatusStats(
    reqDto: GetProductionOrderStatusStatsReqDto,
  ): Promise<ProductionOrderStatusStatResDto[]> {
    const statusCounts = await this.db
      .select({
        status: asText(productionOrders.status),
        productionOrderCount: sql<number>`count(*)::int`,
      })
      .from(productionOrders)
      .where(
        and(
          ...dateRangeConditions(
            vnTimestamp(productionOrders.createdAt),
            reqDto,
          ),
        ),
      )
      .groupBy(productionOrders.status)
      .orderBy(desc(sql`count(*)`), asc(productionOrders.status));

    return plainToInstance(ProductionOrderStatusStatResDto, statusCounts, {
      excludeExtraneousValues: true,
    });
  }
}
