import { Injectable } from '@nestjs/common';
import { and, asc, desc, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import {
  clients,
  orders,
  outboundOrders,
  productionJobs,
  productionOrders,
  users,
} from '../../database/schemas';

import {
  IntegrationResultResDto,
  SummaryMetric,
} from './dto/integration-common.dto';
import {
  CountByStatusReqDto,
  CountClientsReqDto,
  OrderProgressReqDto,
  OrdersGroupBy,
  OrdersSummaryReqDto,
  OrdersWatchKind,
  OrdersWatchlistReqDto,
  OrderValueGroupBy,
  OrderValueMetric,
  OrderValueReqDto,
  OverdueOrdersReqDto,
  PendingDeliveriesReqDto,
  StatusCountEntity,
  TopClientsReqDto,
  TopOrdersReqDto,
} from './dto/integration-orders.req.dto';
import {
  dateRangeConditions,
  equalsText,
  inTexts,
  IntegrationQueryService,
  TODAY,
  whereClause,
} from './integration-query.service';

const REJECTED_STATUS = 'REJECTED';
const DEFAULT_OVERDUE_STATUSES = ['IN_PROGRESS', 'AWAITING_PRODUCTION'];
const DEFAULT_ORDER_VALUE_LIMIT = 10;
const DEFAULT_TOP_CLIENTS_LIMIT = 5;
const DEFAULT_TOP_ORDERS_LIMIT = 10;
const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_DAYS_AHEAD = 7;

type StatusEntity = {
  table: string;
  groupColumns: string[];
  countAlias: string;
  dateColumn: string;
  hasSoftDelete: boolean;
};

// Tên bảng và cột cố định trong code (không lấy từ request) nên chèn thẳng bằng `sql.raw`
const STATUS_ENTITIES: Record<StatusCountEntity, StatusEntity> = {
  [StatusCountEntity.ORDERS]: {
    table: 'orders',
    groupColumns: ['status'],
    countAlias: 'so_don',
    dateColumn: 'order_date',
    hasSoftDelete: true,
  },
  [StatusCountEntity.PRODUCTION_JOBS]: {
    table: 'production_jobs',
    groupColumns: ['status'],
    countAlias: 'so_job',
    dateColumn: 'created_at',
    hasSoftDelete: false,
  },
  [StatusCountEntity.PRODUCTION_ORDERS]: {
    table: 'production_orders',
    groupColumns: ['status'],
    countAlias: 'so_lenh',
    dateColumn: 'created_at',
    hasSoftDelete: false,
  },
  [StatusCountEntity.PAYMENT_REQUESTS]: {
    table: 'payment_requests',
    groupColumns: ['status'],
    countAlias: 'so_de_nghi',
    dateColumn: 'created_at',
    hasSoftDelete: false,
  },
  [StatusCountEntity.INVENTORY_RECEIPTS]: {
    table: 'inventory_receipts',
    groupColumns: ['receipt_type', 'status'],
    countAlias: 'so_phieu',
    dateColumn: 'receipt_date',
    hasSoftDelete: false,
  },
};

@Injectable()
export class IntegrationOrdersService {
  constructor(private readonly queryService: IntegrationQueryService) {}

  countByStatus(reqDto: CountByStatusReqDto): Promise<IntegrationResultResDto> {
    const entity = STATUS_ENTITIES[reqDto.entity];
    const conditions: SQL[] = entity.hasSoftDelete
      ? [sql`deleted_at IS NULL`]
      : [];
    conditions.push(...dateRangeConditions(sql.raw(entity.dateColumn), reqDto));
    // Cột nhóm là enum: ép text để cột trả về luôn là chuỗi
    const groupList = sql.raw(entity.groupColumns.join(', '));
    const selectList = sql.raw(
      entity.groupColumns
        .map((column) => `${column}::text AS ${column}`)
        .join(', '),
    );
    const countAlias = sql.raw(entity.countAlias);
    const orderBy =
      entity.groupColumns.length > 1 ? groupList : sql`${countAlias} DESC`;

    return this.queryService.run(
      'count_by_status',
      [...entity.groupColumns, entity.countAlias],
      sql`SELECT ${selectList}, COUNT(*)::int AS ${countAlias}
        FROM ${sql.raw(entity.table)} ${whereClause(conditions)}
        GROUP BY ${groupList} ORDER BY ${orderBy}`,
    );
  }

  private orderConditions(
    range: TopClientsReqDto | OrderValueReqDto | TopOrdersReqDto,
    options: { status?: string; excludeRejected: boolean },
  ): SQL[] {
    const conditions: SQL[] = [sql`${orders.deletedAt} IS NULL`];
    if (options.excludeRejected) {
      conditions.push(sql`${orders.status}::text <> ${REJECTED_STATUS}`);
    }
    if (options.status) {
      conditions.push(sql`${orders.status}::text = ${options.status}`);
    }
    return [
      ...conditions,
      ...dateRangeConditions(sql`${orders.orderDate}`, range),
    ];
  }

  orderValueOverTime(
    reqDto: OrderValueReqDto,
  ): Promise<IntegrationResultResDto> {
    const where = whereClause(
      this.orderConditions(reqDto, {
        status: reqDto.status,
        excludeRejected: reqDto.excludeRejected ?? true,
      }),
    );
    const isCount = reqDto.metric === OrderValueMetric.COUNT;
    const metric = isCount
      ? sql`COUNT(*)::int`
      : sql`SUM(${orders.total})::float8`;
    const alias = isCount ? 'so_don' : 'tong_gia_tri';
    const aliasSql = sql.raw(alias);
    const groupBy = reqDto.groupBy ?? OrderValueGroupBy.MONTH;

    if (groupBy === OrderValueGroupBy.MONTH) {
      return this.queryService.run(
        'order_value_over_time',
        ['thang', alias],
        sql`SELECT to_char(DATE_TRUNC('month', ${orders.orderDate}), 'YYYY-MM-DD') AS thang,
          ${metric} AS ${aliasSql} FROM ${orders} ${where} GROUP BY 1 ORDER BY 1`,
      );
    }
    if (groupBy === OrderValueGroupBy.STATUS) {
      return this.queryService.run(
        'order_value_over_time',
        ['status', alias],
        sql`SELECT ${orders.status}::text AS status, ${metric} AS ${aliasSql}
          FROM ${orders} ${where} GROUP BY ${orders.status} ORDER BY ${aliasSql} DESC`,
      );
    }
    if (groupBy === OrderValueGroupBy.SALESPERSON) {
      // Đơn chưa có người phụ trách (assigned_user_id NULL) không vào nhóm nào
      return this.queryService.run(
        'order_value_over_time',
        ['nhan_vien', alias],
        sql`SELECT ${users.fullName} AS nhan_vien, ${metric} AS ${aliasSql} FROM ${orders}
          JOIN ${users} ON ${users.id} = ${orders.assignedUserId} ${where}
          GROUP BY ${users.fullName} ORDER BY ${aliasSql} DESC
          LIMIT ${reqDto.limit ?? DEFAULT_ORDER_VALUE_LIMIT}`,
      );
    }
    return this.queryService.run(
      'order_value_over_time',
      ['name', alias],
      sql`SELECT ${clients.name}, ${metric} AS ${aliasSql} FROM ${orders}
        JOIN ${clients} ON ${clients.id} = ${orders.clientId} ${where}
        GROUP BY ${clients.name} ORDER BY ${aliasSql} DESC
        LIMIT ${reqDto.limit ?? DEFAULT_ORDER_VALUE_LIMIT}`,
    );
  }

  topClientsByOrderValue(
    reqDto: TopClientsReqDto,
  ): Promise<IntegrationResultResDto> {
    const where = whereClause(
      this.orderConditions(reqDto, {
        excludeRejected: reqDto.excludeRejected ?? true,
      }),
    );
    return this.queryService.run(
      'top_clients_by_order_value',
      ['name', 'tong_gia_tri'],
      sql`SELECT ${clients.name}, SUM(${orders.total})::float8 AS tong_gia_tri FROM ${orders}
        JOIN ${clients} ON ${clients.id} = ${orders.clientId} ${where}
        GROUP BY ${clients.name} ORDER BY tong_gia_tri DESC
        LIMIT ${reqDto.limit ?? DEFAULT_TOP_CLIENTS_LIMIT}`,
    );
  }

  topOrdersByValue(reqDto: TopOrdersReqDto): Promise<IntegrationResultResDto> {
    const conditions = this.orderConditions(reqDto, {
      status: reqDto.status,
      excludeRejected: reqDto.excludeRejected ?? true,
    });
    if (reqDto.minTotal !== undefined) {
      conditions.push(sql`${orders.total} >= ${reqDto.minTotal}`);
    }
    return this.queryService.run(
      'top_orders_by_value',
      ['don_hang', 'khach_hang', 'status', 'due_date', 'tong_gia_tri'],
      sql`SELECT ${orders.code} AS don_hang, ${clients.name} AS khach_hang,
        ${orders.status}::text AS status, ${orders.dueDate}::text AS due_date,
        ${orders.total}::float8 AS tong_gia_tri
        FROM ${orders} JOIN ${clients} ON ${clients.id} = ${orders.clientId}
        ${whereClause(conditions)}
        ORDER BY ${orders.total} DESC LIMIT ${reqDto.limit ?? DEFAULT_TOP_ORDERS_LIMIT}`,
    );
  }

  overdueOrders(reqDto: OverdueOrdersReqDto): Promise<IntegrationResultResDto> {
    const statuses = reqDto.statuses?.length
      ? reqDto.statuses
      : DEFAULT_OVERDUE_STATUSES;
    const statusList = sql.join(
      statuses.map((status) => sql`${status}`),
      sql`, `,
    );
    const withClient = reqDto.withClient ?? false;
    const clientColumn = withClient
      ? sql`, ${clients.name} AS khach_hang`
      : sql``;
    const clientJoin = withClient
      ? sql` JOIN ${clients} ON ${clients.id} = ${orders.clientId}`
      : sql``;
    const columns = ['code', 'due_date', 'status'];
    if (withClient) {
      columns.push('khach_hang');
    }

    return this.queryService.run(
      'overdue_orders',
      columns,
      sql`SELECT ${orders.code}, ${orders.dueDate}::text AS due_date, ${orders.status}::text AS status${clientColumn}
        FROM ${orders}${clientJoin}
        WHERE ${orders.deletedAt} IS NULL AND ${orders.status}::text IN (${statusList})
        AND ${orders.dueDate} < ${TODAY} + ${reqDto.dueWithinDays ?? 0}::int
        ORDER BY ${orders.dueDate}`,
    );
  }

  pendingDeliveries(
    reqDto: PendingDeliveriesReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.run(
      'pending_deliveries',
      ['phieu_xuat', 'khach_hang', 'ngay_giao', 'so_ngay_con_lai'],
      sql`SELECT ${outboundOrders.code} AS phieu_xuat, ${clients.name} AS khach_hang,
        ${outboundOrders.fulfillmentDate}::text AS ngay_giao,
        (${outboundOrders.fulfillmentDate} - ${TODAY})::int AS so_ngay_con_lai
        FROM ${outboundOrders} JOIN ${clients} ON ${clients.id} = ${outboundOrders.clientId}
        WHERE ${outboundOrders.status}::text = 'PENDING_DELIVERY'
        AND ${outboundOrders.fulfillmentDate} <= ${TODAY} + ${reqDto.daysAhead ?? DEFAULT_DAYS_AHEAD}::int
        ORDER BY ${outboundOrders.fulfillmentDate} LIMIT ${reqDto.limit ?? DEFAULT_LIST_LIMIT}`,
    );
  }

  orderProgress(reqDto: OrderProgressReqDto): Promise<IntegrationResultResDto> {
    let condition: SQL;
    if (reqDto.orderCode) {
      condition = sql`${orders.code} = ${reqDto.orderCode}`;
    } else if (reqDto.status) {
      condition = sql`${orders.status}::text = ${reqDto.status}`;
    } else {
      condition = sql`${orders.status}::text IN ('AWAITING_PRODUCTION', 'IN_PROGRESS')`;
    }

    return this.queryService.run(
      'order_progress',
      [
        'don_hang',
        'khach_hang',
        'status',
        'due_date',
        'so_cong_viec',
        'so_cong_viec_xong',
      ],
      sql`SELECT ${orders.code} AS don_hang, ${clients.name} AS khach_hang, ${orders.status}::text AS status,
        ${orders.dueDate}::text AS due_date, COUNT(${productionJobs.id})::int AS so_cong_viec,
        SUM(CASE WHEN ${productionJobs.status}::text = 'COMPLETED' THEN 1 ELSE 0 END)::int AS so_cong_viec_xong
        FROM ${orders} JOIN ${clients} ON ${clients.id} = ${orders.clientId}
        LEFT JOIN ${productionOrders} ON ${productionOrders.orderId} = ${orders.id}
          AND ${productionOrders.sourceType} = 'ORDER'
        LEFT JOIN ${productionJobs} ON ${productionJobs.productionOrderId} = ${productionOrders.id}
        WHERE ${orders.deletedAt} IS NULL AND ${condition}
        GROUP BY ${orders.code}, ${clients.name}, ${orders.status}, ${orders.dueDate}
        ORDER BY ${orders.dueDate} LIMIT ${reqDto.limit ?? DEFAULT_LIST_LIMIT}`,
    );
  }

  countClients(reqDto: CountClientsReqDto): Promise<IntegrationResultResDto> {
    if (reqDto.status) {
      return this.queryService.run(
        'count_clients',
        ['so_khach_hang'],
        sql`SELECT COUNT(*)::int AS so_khach_hang FROM clients
          WHERE deleted_at IS NULL AND status::text = ${reqDto.status}`,
      );
    }
    return this.queryService.run(
      'count_clients',
      ['status', 'so_khach_hang'],
      sql`SELECT status::text AS status, COUNT(*)::int AS so_khach_hang FROM clients
        WHERE deleted_at IS NULL GROUP BY status ORDER BY so_khach_hang DESC`,
    );
  }

  summarizeOrders(
    reqDto: OrdersSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    switch (reqDto.groupBy) {
      case OrdersGroupBy.MONTH:
        return this.summarizeByMonth(reqDto);
      case OrdersGroupBy.STATUS:
        return this.summarizeByStatus(reqDto);
      case OrdersGroupBy.SALESPERSON:
        return this.summarizeBySalesperson(reqDto);
      case OrdersGroupBy.CLIENT:
        return this.summarizeByClient(reqDto);
      case OrdersGroupBy.ORDER:
        return this.listTopOrders(reqDto);
      case OrdersGroupBy.CLIENT_STATUS:
        return this.countClientsByStatus(reqDto);
    }
  }

  listOrdersWatchlist(
    reqDto: OrdersWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return reqDto.kind === OrdersWatchKind.OVERDUE_ORDERS
      ? this.listOverdueOrders(reqDto)
      : this.listPendingDeliveries(reqDto);
  }

  private buildOrderFilters(reqDto: OrdersSummaryReqDto): SQL[] {
    // Gom theo trạng thái mà bỏ đơn bị từ chối thì nhóm REJECTED không bao giờ hiện
    // và lọc đúng một trạng thái thì loại trừ mâu thuẫn với điều kiện lọc, nên cũng bỏ qua
    const shouldExcludeRejected =
      reqDto.excludeRejected ??
      (reqDto.groupBy !== OrdersGroupBy.STATUS && !reqDto.status);
    const filters: SQL[] = [
      isNull(orders.deletedAt),
      ...dateRangeConditions(sql`${orders.orderDate}`, reqDto),
    ];
    if (shouldExcludeRejected) {
      filters.push(sql`${orders.status}::text <> ${REJECTED_STATUS}`);
    }
    if (reqDto.status) {
      filters.push(equalsText(orders.status, reqDto.status));
    }
    return filters;
  }

  private buildMetric(metric: SummaryMetric = SummaryMetric.TOTAL): {
    alias: string;
    value: SQL<number>;
  } {
    return metric === SummaryMetric.COUNT
      ? { alias: 'so_don', value: sql<number>`count(*)::int` }
      : {
          alias: 'tong_gia_tri',
          value: sql<number>`sum(${orders.total})::float8`,
        };
  }

  private summarizeByMonth(
    reqDto: OrdersSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const metric = this.buildMetric(reqDto.metric);
    const month = sql<string>`to_char(date_trunc('month', ${orders.orderDate}), 'YYYY-MM-DD')`;
    return this.queryService.query(
      'orders_summary',
      ['thang', metric.alias],
      (tx) =>
        tx
          .select({ thang: month, [metric.alias]: metric.value })
          .from(orders)
          .where(and(...this.buildOrderFilters(reqDto)))
          .groupBy(month)
          .orderBy(asc(month)),
    );
  }

  private summarizeByStatus(
    reqDto: OrdersSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const metric = this.buildMetric(reqDto.metric);
    return this.queryService.query(
      'orders_summary',
      ['status', metric.alias],
      (tx) =>
        tx
          .select({
            status: sql<string>`${orders.status}::text`,
            [metric.alias]: metric.value,
          })
          .from(orders)
          .where(and(...this.buildOrderFilters(reqDto)))
          .groupBy(orders.status)
          .orderBy(desc(metric.value)),
    );
  }

  // Đơn chưa có người phụ trách (assignedUserId NULL) không vào nhóm nào
  private summarizeBySalesperson(
    reqDto: OrdersSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const metric = this.buildMetric(reqDto.metric);
    return this.queryService.query(
      'orders_summary',
      ['nhan_vien', metric.alias],
      (tx) =>
        tx
          .select({ nhan_vien: users.fullName, [metric.alias]: metric.value })
          .from(orders)
          .innerJoin(users, sql`${users.id} = ${orders.assignedUserId}`)
          .where(and(...this.buildOrderFilters(reqDto)))
          .groupBy(users.fullName)
          .orderBy(desc(metric.value))
          .limit(reqDto.limit ?? DEFAULT_ORDER_VALUE_LIMIT),
    );
  }

  private summarizeByClient(
    reqDto: OrdersSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const metric = this.buildMetric(reqDto.metric);
    return this.queryService.query(
      'orders_summary',
      ['name', metric.alias],
      (tx) =>
        tx
          .select({ name: clients.name, [metric.alias]: metric.value })
          .from(orders)
          .innerJoin(clients, sql`${clients.id} = ${orders.clientId}`)
          .where(and(...this.buildOrderFilters(reqDto)))
          .groupBy(clients.name)
          .orderBy(desc(metric.value))
          .limit(reqDto.limit ?? DEFAULT_ORDER_VALUE_LIMIT),
    );
  }

  private listTopOrders(
    reqDto: OrdersSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const filters = this.buildOrderFilters(reqDto);
    if (reqDto.minTotal !== undefined) {
      filters.push(sql`${orders.total} >= ${reqDto.minTotal}`);
    }
    return this.queryService.query(
      'orders_summary',
      ['don_hang', 'khach_hang', 'status', 'due_date', 'tong_gia_tri'],
      (tx) =>
        tx
          .select({
            don_hang: orders.code,
            khach_hang: clients.name,
            status: sql<string>`${orders.status}::text`,
            due_date: sql<string>`${orders.dueDate}::text`,
            tong_gia_tri: sql<number>`${orders.total}::float8`,
          })
          .from(orders)
          .innerJoin(clients, sql`${clients.id} = ${orders.clientId}`)
          .where(and(...filters))
          .orderBy(desc(orders.total))
          .limit(reqDto.limit ?? DEFAULT_ORDER_VALUE_LIMIT),
    );
  }

  private countClientsByStatus(
    reqDto: OrdersSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const filters: SQL[] = [isNull(clients.deletedAt)];
    if (reqDto.status) {
      filters.push(equalsText(clients.status, reqDto.status));
    }
    return this.queryService.query(
      'orders_summary',
      ['status', 'so_khach_hang'],
      (tx) =>
        tx
          .select({
            status: sql<string>`${clients.status}::text`,
            so_khach_hang: sql<number>`count(*)::int`,
          })
          .from(clients)
          .where(and(...filters))
          .groupBy(clients.status)
          .orderBy(desc(sql`count(*)`)),
    );
  }

  private listOverdueOrders(
    reqDto: OrdersWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    const statuses = reqDto.statuses?.length
      ? reqDto.statuses
      : DEFAULT_OVERDUE_STATUSES;
    const columns: Array<'code' | 'due_date' | 'status' | 'khach_hang'> = [
      'code',
      'due_date',
      'status',
    ];
    if (reqDto.withClient) {
      columns.push('khach_hang');
    }
    return this.queryService.query('orders_watchlist', columns, (tx) =>
      tx
        .select({
          code: orders.code,
          due_date: sql<string>`${orders.dueDate}::text`,
          status: sql<string>`${orders.status}::text`,
          khach_hang: clients.name,
        })
        .from(orders)
        .innerJoin(clients, sql`${clients.id} = ${orders.clientId}`)
        .where(
          and(
            isNull(orders.deletedAt),
            inTexts(orders.status, statuses),
            sql`${orders.dueDate} < ${TODAY} + ${reqDto.dueWithinDays ?? 0}::int`,
          ),
        )
        .orderBy(asc(orders.dueDate))
        .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT),
    );
  }

  private listPendingDeliveries(
    reqDto: OrdersWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'orders_watchlist',
      ['phieu_xuat', 'khach_hang', 'ngay_giao', 'so_ngay_con_lai'],
      (tx) =>
        tx
          .select({
            phieu_xuat: outboundOrders.code,
            khach_hang: clients.name,
            ngay_giao: sql<string>`${outboundOrders.fulfillmentDate}::text`,
            so_ngay_con_lai: sql<number>`(${outboundOrders.fulfillmentDate} - ${TODAY})::int`,
          })
          .from(outboundOrders)
          .innerJoin(clients, sql`${clients.id} = ${outboundOrders.clientId}`)
          .where(
            and(
              equalsText(outboundOrders.status, 'PENDING_DELIVERY'),
              sql`${outboundOrders.fulfillmentDate} <= ${TODAY} + ${reqDto.daysAhead ?? DEFAULT_DAYS_AHEAD}::int`,
            ),
          )
          .orderBy(asc(outboundOrders.fulfillmentDate))
          .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT),
    );
  }
}
