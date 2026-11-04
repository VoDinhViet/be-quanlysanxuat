import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  desc,
  eq,
  isNull,
  lt,
  ne,
  notInArray,
  sql,
} from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import {
  asNumber,
  asText,
  dateRangeConditions,
  daysSince,
  equalsText,
  TODAY,
} from '../../common/summary/summary.sql';
import { vnTimestamp } from '../../common/utils/time';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  items,
  orders,
  OrderStatus,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  productionOrders,
} from '../../database/schemas';
import { GetLateProductionJobOperationsReqDto } from './dto/get-late-production-job-operations.req.dto';
import { GetProductionJobItemSummaryReqDto } from './dto/get-production-job-item-summary.req.dto';
import { GetProductionJobOperationTypeStatsReqDto } from './dto/get-production-job-operation-type-stats.req.dto';
import { LateProductionJobOperationResDto } from './dto/late-production-job-operation.res.dto';
import { ProductionJobItemSummaryResDto } from './dto/production-job-item-summary.res.dto';
import { ProductionJobOperationTypeStatResDto } from './dto/production-job-operation-type-stat.res.dto';

const DEFAULT_ITEM_SUMMARY_STATUS = ProductionJobStatus.COMPLETED;
const INACTIVE_ORDER_STATUSES = [OrderStatus.CANCELLED, OrderStatus.REJECTED];

@Injectable()
export class ProductionJobsSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getItemSummary(
    reqDto: GetProductionJobItemSummaryReqDto,
  ): Promise<ProductionJobItemSummaryResDto[]> {
    const jobCountByItem = await this.db
      .select({
        itemId: items.id,
        itemCode: items.code,
        itemName: items.name,
        jobCount: sql<number>`count(*)::int`,
      })
      .from(productionJobs)
      .innerJoin(items, eq(items.id, productionJobs.itemId))
      .where(
        and(
          equalsText(
            productionJobs.status,
            reqDto.status ?? DEFAULT_ITEM_SUMMARY_STATUS,
          ),
          ...dateRangeConditions(vnTimestamp(productionJobs.createdAt), reqDto),
        ),
      )
      .groupBy(items.id, items.code, items.name)
      .orderBy(desc(sql`count(*)`), asc(items.code))
      .limit(limitOf(reqDto));

    return plainToInstance(ProductionJobItemSummaryResDto, jobCountByItem, {
      excludeExtraneousValues: true,
    });
  }

  async getLateOperations(
    reqDto: GetLateProductionJobOperationsReqDto,
  ): Promise<LateProductionJobOperationResDto[]> {
    const lateOperations = await this.db
      .select({
        orderCode: orders.code,
        jobCode: productionJobs.code,
        operationName: productionJobOperations.name,
        dueDate: asText(productionJobOperations.dueDate),
        daysOverdue: daysSince(productionJobOperations.dueDate),
        completedQuantity: asNumber(productionJobOperations.completedQuantity),
        jobQuantity: asNumber(productionJobs.quantity),
      })
      .from(productionJobOperations)
      .innerJoin(
        productionJobs,
        eq(productionJobs.id, productionJobOperations.productionJobId),
      )
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .where(and(...this.lateOperationConditions(reqDto)))
      .orderBy(asc(productionJobOperations.dueDate), asc(productionJobs.code))
      .limit(limitOf(reqDto));

    return plainToInstance(LateProductionJobOperationResDto, lateOperations, {
      excludeExtraneousValues: true,
    });
  }

  async getOperationTypeStats(
    reqDto: GetProductionJobOperationTypeStatsReqDto,
  ): Promise<ProductionJobOperationTypeStatResDto[]> {
    const operationCountByType = await this.db
      .select({
        type: asText(productionJobOperations.type),
        operationCount: sql<number>`count(*)::int`,
      })
      .from(productionJobOperations)
      .where(
        reqDto.type
          ? equalsText(productionJobOperations.type, reqDto.type)
          : undefined,
      )
      .groupBy(productionJobOperations.type)
      .orderBy(desc(sql`count(*)`), asc(productionJobOperations.type));

    return plainToInstance(
      ProductionJobOperationTypeStatResDto,
      operationCountByType,
      { excludeExtraneousValues: true },
    );
  }

  private lateOperationConditions(
    reqDto: GetLateProductionJobOperationsReqDto,
  ): SQL[] {
    const conditions: SQL[] = [
      sql`${productionJobOperations.dueDate} < ${TODAY}`,
      lt(productionJobOperations.completedQuantity, productionJobs.quantity),
      ne(productionJobs.status, ProductionJobStatus.COMPLETED),
      isNull(orders.deletedAt),
      notInArray(orders.status, INACTIVE_ORDER_STATUSES),
    ];
    if (!reqDto.staleDays) {
      return conditions;
    }

    // Công đoạn chưa từng báo cáo (NULL) cũng tính là lâu không có tiến độ
    return [
      ...conditions,
      sql`(${productionJobOperations.lastReportedAt} IS NULL
        OR ${vnTimestamp(productionJobOperations.lastReportedAt)}::date < ${TODAY} - ${reqDto.staleDays}::int)`,
    ];
  }
}
