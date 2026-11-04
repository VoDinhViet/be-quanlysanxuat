import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import {
  asText,
  dateRangeAndStatusConditions,
  daysSince,
  TODAY,
} from '../../common/summary/summary.sql';
import { vnTimestamp } from '../../common/utils/time';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { outsourcingOrders, suppliers } from '../../database/schemas';
import {
  GetOutsourcingOrderSummaryReqDto,
  OutsourcingOrderSummaryGroupBy,
} from './dto/get-outsourcing-order-summary.req.dto';
import { GetOverdueOutsourcingOrdersReqDto } from './dto/get-overdue-outsourcing-orders.req.dto';
import { OutsourcingOrderSummaryResDto } from './dto/outsourcing-order-summary.res.dto';
import { OverdueOutsourcingOrderResDto } from './dto/overdue-outsourcing-order.res.dto';
import { OUTSOURCING_AWAITING_RETURN_STATUSES } from './outsourcing-orders.constant';

@Injectable()
export class OutsourcingOrdersSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOrderSummary(
    reqDto: GetOutsourcingOrderSummaryReqDto,
  ): Promise<OutsourcingOrderSummaryResDto[]> {
    const conditions = dateRangeAndStatusConditions(
      vnTimestamp(outsourcingOrders.createdAt),
      outsourcingOrders.status,
      reqDto,
    );
    const limit = limitOf(reqDto);
    const orderCounts =
      reqDto.groupBy === OutsourcingOrderSummaryGroupBy.SUPPLIER
        ? await this.countBySupplier(conditions, limit)
        : await this.countByStatus(conditions, limit);

    return plainToInstance(OutsourcingOrderSummaryResDto, orderCounts, {
      excludeExtraneousValues: true,
    });
  }

  async getOverdueOrders(
    reqDto: GetOverdueOutsourcingOrdersReqDto,
  ): Promise<OverdueOutsourcingOrderResDto[]> {
    const overdueOrders = await this.db
      .select({
        id: outsourcingOrders.id,
        code: outsourcingOrders.code,
        supplierName: suppliers.name,
        expectedReturnDate: asText(outsourcingOrders.expectedReturnDate),
        daysOverdue: daysSince(outsourcingOrders.expectedReturnDate),
        status: asText(outsourcingOrders.status),
      })
      .from(outsourcingOrders)
      .innerJoin(suppliers, eq(suppliers.id, outsourcingOrders.supplierId))
      .where(
        and(
          inArray(
            outsourcingOrders.status,
            OUTSOURCING_AWAITING_RETURN_STATUSES,
          ),
          sql`${outsourcingOrders.expectedReturnDate} < ${TODAY}`,
        ),
      )
      .orderBy(asc(outsourcingOrders.expectedReturnDate))
      .limit(limitOf(reqDto));

    return plainToInstance(OverdueOutsourcingOrderResDto, overdueOrders, {
      excludeExtraneousValues: true,
    });
  }

  private countByStatus(
    conditions: SQL[],
    limit: number,
  ): Promise<OutsourcingOrderSummaryResDto[]> {
    return this.db
      .select({
        status: asText(outsourcingOrders.status),
        orderCount: sql<number>`count(*)::int`,
      })
      .from(outsourcingOrders)
      .where(and(...conditions))
      .groupBy(outsourcingOrders.status)
      .orderBy(desc(sql`count(*)`), asc(outsourcingOrders.status))
      .limit(limit);
  }

  private countBySupplier(
    conditions: SQL[],
    limit: number,
  ): Promise<OutsourcingOrderSummaryResDto[]> {
    return this.db
      .select({
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(outsourcingOrders)
      .innerJoin(suppliers, eq(suppliers.id, outsourcingOrders.supplierId))
      .where(and(...conditions))
      .groupBy(suppliers.id, suppliers.name)
      .orderBy(desc(sql`count(*)`), asc(suppliers.name))
      .limit(limit);
  }
}
