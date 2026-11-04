import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  sql,
} from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { limitOf, SummaryMetric } from '../../common/summary/summary.dto';
import type { DateRangeReqDto } from '../../common/summary/summary.dto';
import {
  asText,
  dateRangeConditions,
  TODAY,
} from '../../common/summary/summary.sql';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  clients,
  OrderStatus,
  orders,
  productionJobs,
  ProductionJobStatus,
  productionOrders,
  ProductionOrderSourceType,
  users,
} from '../../database/schemas';
import { GetOrderTopValueReqDto } from './dto/get-order-top-value.req.dto';
import { GetOrderProgressReqDto } from './dto/get-order-progress.req.dto';
import {
  GetOrderValueSummaryReqDto,
  OrderValueGroupBy,
} from './dto/get-order-value-summary.req.dto';
import { GetOverdueOrdersReqDto } from './dto/get-overdue-orders.req.dto';
import { OrderProgressResDto } from './dto/order-progress.res.dto';
import { OrderTopValueResDto } from './dto/order-top-value.res.dto';
import { OrderValueSummaryResDto } from './dto/order-value-summary.res.dto';
import { OverdueOrderResDto } from './dto/overdue-order.res.dto';
import {
  DEFAULT_ORDER_RANKING_LIMIT,
  IN_PRODUCTION_STATUSES,
} from './orders-summary.constant';

interface OrderFilterInput {
  range: DateRangeReqDto;
  status?: OrderStatus;
  excludeRejected: boolean;
}

interface ValueSummaryScope {
  filters: SQL | undefined;
  ranking: SQL<number>;
  limit: number;
}

// Đơn ngoại tệ phải quy VND trước khi cộng; đơn VND có `exchangeRate` = 1. Cùng cách tính với
// `OrdersService.getOrderStats`.
const ORDER_TOTAL_VND = sql`${orders.total} * ${orders.exchangeRate}`;
const TOTAL_VALUE = sql<number>`round(coalesce(sum(${ORDER_TOTAL_VND}), 0), 0)::float8`;
const ORDER_COUNT = sql<number>`count(*)::int`;
const VALUE_AGGREGATES = { totalValue: TOTAL_VALUE, orderCount: ORDER_COUNT };

// Cột `date` ép thành chuỗi để trả đúng `YYYY-MM-DD` thay vì `Date` theo múi giờ máy chủ
const DUE_DATE_TEXT = asText(orders.dueDate);

@Injectable()
export class OrdersSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOrderValueSummary(
    reqDto: GetOrderValueSummaryReqDto,
  ): Promise<OrderValueSummaryResDto[]> {
    const groupBy = reqDto.groupBy ?? OrderValueGroupBy.MONTH;
    const scope: ValueSummaryScope = {
      filters: this.buildOrderFilters({
        range: reqDto,
        status: reqDto.status,
        // Gom theo trạng thái mà bỏ đơn bị từ chối thì nhóm REJECTED không bao giờ hiện, và lọc
        // đúng một trạng thái thì loại trừ mâu thuẫn với điều kiện lọc
        excludeRejected:
          reqDto.excludeRejected ??
          (groupBy !== OrderValueGroupBy.STATUS && !reqDto.status),
      }),
      ranking:
        reqDto.metric === SummaryMetric.COUNT ? ORDER_COUNT : TOTAL_VALUE,
      limit: limitOf(reqDto, DEFAULT_ORDER_RANKING_LIMIT),
    };

    const valueGroups = await this.queryValueGroups(groupBy, scope, reqDto);
    return plainToInstance(OrderValueSummaryResDto, valueGroups, {
      excludeExtraneousValues: true,
    });
  }

  async getOrderTopValue(
    reqDto: GetOrderTopValueReqDto,
  ): Promise<OrderTopValueResDto[]> {
    const filters = and(
      this.buildOrderFilters({
        range: reqDto,
        status: reqDto.status,
        excludeRejected: reqDto.excludeRejected ?? !reqDto.status,
      }),
      reqDto.minTotal === undefined
        ? undefined
        : gte(ORDER_TOTAL_VND, reqDto.minTotal),
      reqDto.maxTotal === undefined
        ? undefined
        : lt(ORDER_TOTAL_VND, reqDto.maxTotal),
    );

    const topOrders = await this.db
      .select({
        id: orders.id,
        code: orders.code,
        clientName: clients.name,
        status: orders.status,
        dueDate: DUE_DATE_TEXT,
        totalValue: sql<number>`round(${ORDER_TOTAL_VND}, 0)::float8`,
      })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .where(filters)
      .orderBy(desc(ORDER_TOTAL_VND), asc(orders.code))
      .limit(limitOf(reqDto, DEFAULT_ORDER_RANKING_LIMIT));

    return plainToInstance(OrderTopValueResDto, topOrders, {
      excludeExtraneousValues: true,
    });
  }

  async getOverdueOrders(
    reqDto: GetOverdueOrdersReqDto,
  ): Promise<OverdueOrderResDto[]> {
    const statuses = reqDto.statuses?.length
      ? reqDto.statuses
      : [...IN_PRODUCTION_STATUSES];

    const overdueOrders = await this.db
      .select({
        id: orders.id,
        code: orders.code,
        clientName: clients.name,
        status: orders.status,
        dueDate: DUE_DATE_TEXT,
      })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .where(
        and(
          isNull(orders.deletedAt),
          inArray(orders.status, statuses),
          sql`${orders.dueDate} < ${TODAY} + ${reqDto.dueWithinDays ?? 0}::int`,
        ),
      )
      .orderBy(asc(orders.dueDate), asc(orders.code))
      .limit(limitOf(reqDto));

    return plainToInstance(OverdueOrderResDto, overdueOrders, {
      excludeExtraneousValues: true,
    });
  }

  async getOrderProgress(
    reqDto: GetOrderProgressReqDto,
  ): Promise<OrderProgressResDto[]> {
    const jobCount = sql<number>`count(${productionJobs.id})::int`;
    const completedJobCount = sql<number>`(count(${productionJobs.id}) FILTER (WHERE ${eq(productionJobs.status, ProductionJobStatus.COMPLETED)}))::int`;

    const progresses = await this.db
      .select({
        id: orders.id,
        code: orders.code,
        clientName: clients.name,
        status: orders.status,
        dueDate: DUE_DATE_TEXT,
        jobCount,
        completedJobCount,
      })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .leftJoin(
        productionOrders,
        and(
          eq(productionOrders.orderId, orders.id),
          eq(productionOrders.sourceType, ProductionOrderSourceType.ORDER),
        ),
      )
      .leftJoin(
        productionJobs,
        eq(productionJobs.productionOrderId, productionOrders.id),
      )
      .where(and(isNull(orders.deletedAt), this.buildProgressScope(reqDto)))
      .groupBy(orders.id, clients.name)
      .orderBy(asc(orders.dueDate), asc(orders.code))
      .limit(limitOf(reqDto));

    return plainToInstance(OrderProgressResDto, progresses, {
      excludeExtraneousValues: true,
    });
  }

  private buildOrderFilters(input: OrderFilterInput): SQL | undefined {
    return and(
      isNull(orders.deletedAt),
      ...dateRangeConditions(orders.orderDate, input.range),
      input.excludeRejected
        ? ne(orders.status, OrderStatus.REJECTED)
        : undefined,
      input.status ? eq(orders.status, input.status) : undefined,
    );
  }

  // Có mã đơn thì xem đúng đơn đó dù đã xong; không thì chỉ các đơn đang sản xuất
  private buildProgressScope(reqDto: GetOrderProgressReqDto): SQL | undefined {
    if (reqDto.orderCode) {
      return eq(orders.code, reqDto.orderCode);
    }

    return inArray(
      orders.status,
      reqDto.status ? [reqDto.status] : [...IN_PRODUCTION_STATUSES],
    );
  }

  private queryValueGroups(
    groupBy: OrderValueGroupBy,
    scope: ValueSummaryScope,
    reqDto: GetOrderValueSummaryReqDto,
  ): Promise<OrderValueSummaryResDto[]> {
    switch (groupBy) {
      case OrderValueGroupBy.MONTH:
        return this.groupByMonth(scope);
      case OrderValueGroupBy.STATUS:
        return this.groupByStatus(scope);
      case OrderValueGroupBy.SALESPERSON:
        return this.groupBySalesperson(scope);
      case OrderValueGroupBy.CLIENT:
        return this.groupByClient(scope, reqDto);
    }
  }

  private groupByMonth(
    scope: ValueSummaryScope,
  ): Promise<OrderValueSummaryResDto[]> {
    const month = sql<string>`to_char(date_trunc('month', ${orders.orderDate}), 'YYYY-MM-DD')`;

    return this.db
      .select({ month, ...VALUE_AGGREGATES })
      .from(orders)
      .where(scope.filters)
      .groupBy(month)
      .orderBy(asc(month));
  }

  private groupByStatus(
    scope: ValueSummaryScope,
  ): Promise<OrderValueSummaryResDto[]> {
    return this.db
      .select({ status: orders.status, ...VALUE_AGGREGATES })
      .from(orders)
      .where(scope.filters)
      .groupBy(orders.status)
      .orderBy(desc(scope.ranking));
  }

  // Đơn chưa có người phụ trách không vào nhóm nào
  private groupBySalesperson(
    scope: ValueSummaryScope,
  ): Promise<OrderValueSummaryResDto[]> {
    return this.db
      .select({ salespersonName: users.fullName, ...VALUE_AGGREGATES })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.assignedUserId))
      .where(scope.filters)
      .groupBy(users.id, users.fullName)
      .orderBy(desc(scope.ranking))
      .limit(scope.limit);
  }

  private groupByClient(
    scope: ValueSummaryScope,
    reqDto: GetOrderValueSummaryReqDto,
  ): Promise<OrderValueSummaryResDto[]> {
    // Lọc theo tổng giá trị đơn của khách trong kỳ, kể cả khi đang xếp theo số đơn
    const clientTotal = sql`sum(${ORDER_TOTAL_VND})`;

    return this.db
      .select({ clientName: clients.name, ...VALUE_AGGREGATES })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .where(scope.filters)
      .groupBy(clients.id, clients.name)
      .having(
        and(
          reqDto.minTotal === undefined
            ? undefined
            : gte(clientTotal, reqDto.minTotal),
          reqDto.maxTotal === undefined
            ? undefined
            : lt(clientTotal, reqDto.maxTotal),
        ),
      )
      .orderBy(desc(scope.ranking))
      .limit(scope.limit);
  }
}
