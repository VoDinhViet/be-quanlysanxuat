import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import {
  items,
  orders,
  outsourcingOrders,
  productionJobOperations,
  productionJobs,
  productionOrders,
  suppliers,
} from '../../database/schemas';
import { vnTimestamp } from '../../common/utils/time';

import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  LateJobOperationsReqDto,
  OperationsByTypeReqDto,
  ProductionJobsByItemReqDto,
  ProductionSummaryEntity,
  ProductionSummaryGroupBy,
  ProductionSummaryReqDto,
  ProductionWatchKind,
  ProductionWatchlistReqDto,
} from './dto/integration-production.req.dto';
import {
  dateRangeConditions,
  equalsText,
  inTexts,
  IntegrationQueryService,
  TODAY,
  whereClause,
} from './integration-query.service';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_JOB_STATUS = 'COMPLETED';
const OPEN_OUTSOURCING_STATUSES = ['SENT', 'PARTIAL', 'WAITING_QC'];

@Injectable()
export class IntegrationProductionService {
  constructor(private readonly queryService: IntegrationQueryService) {}

  openProductionOrders(): Promise<IntegrationResultResDto> {
    return this.queryService.run(
      'open_production_orders',
      ['lenh_san_xuat', 'don_hang', 'status'],
      sql`SELECT ${productionOrders.code} AS lenh_san_xuat, ${orders.code} AS don_hang, ${productionOrders.status}::text AS status
        FROM ${productionOrders} JOIN ${orders} ON ${orders.id} = ${productionOrders.orderId}
        WHERE ${productionOrders.status}::text <> 'COMPLETED' ORDER BY ${productionOrders.code}`,
    );
  }

  productionJobsByItem(
    reqDto: ProductionJobsByItemReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.run(
      'production_jobs_by_item',
      ['code', 'name', 'so_job'],
      sql`SELECT ${items.code}, ${items.name}, COUNT(*)::int AS so_job FROM ${productionJobs}
        JOIN ${items} ON ${items.id} = ${productionJobs.itemId}
        WHERE ${productionJobs.status}::text = ${reqDto.status ?? DEFAULT_JOB_STATUS}
        GROUP BY ${items.code}, ${items.name} ORDER BY so_job DESC`,
    );
  }

  lateJobOperations(
    reqDto: LateJobOperationsReqDto,
  ): Promise<IntegrationResultResDto> {
    const conditions: SQL[] = [
      sql`${productionJobOperations.dueDate} < ${TODAY}`,
      sql`COALESCE(${productionJobOperations.completedQuantity}, 0) < ${productionJobs.quantity}`,
      sql`${productionJobs.status}::text <> 'COMPLETED'`,
      sql`${orders.deletedAt} IS NULL`,
      sql`${orders.status}::text NOT IN ('CANCELLED', 'REJECTED')`,
    ];
    if (reqDto.staleDays) {
      conditions.push(
        sql`(${productionJobOperations.lastReportedAt} IS NULL
          OR ${vnTimestamp(productionJobOperations.lastReportedAt)}::date < ${TODAY} - ${reqDto.staleDays}::int)`,
      );
    }

    return this.queryService.run(
      'late_job_operations',
      [
        'don_hang',
        'cong_viec',
        'cong_doan',
        'han',
        'so_ngay_tre',
        'da_lam',
        'so_luong',
      ],
      sql`SELECT ${orders.code} AS don_hang, ${productionJobs.code} AS cong_viec, ${productionJobOperations.name} AS cong_doan,
        ${productionJobOperations.dueDate}::text AS han, (${TODAY} - ${productionJobOperations.dueDate})::int AS so_ngay_tre,
        COALESCE(${productionJobOperations.completedQuantity}, 0)::float8 AS da_lam,
        ${productionJobs.quantity}::float8 AS so_luong
        FROM ${productionJobOperations}
        JOIN ${productionJobs} ON ${productionJobs.id} = ${productionJobOperations.productionJobId}
        JOIN ${productionOrders} ON ${productionOrders.id} = ${productionJobs.productionOrderId}
        JOIN ${orders} ON ${orders.id} = ${productionOrders.orderId}
        ${whereClause(conditions)}
        ORDER BY so_ngay_tre DESC LIMIT ${reqDto.limit ?? DEFAULT_LIST_LIMIT}`,
    );
  }

  operationsByType(
    reqDto: OperationsByTypeReqDto,
  ): Promise<IntegrationResultResDto> {
    if (reqDto.type) {
      return this.queryService.run(
        'operations_by_type',
        ['so_cong_doan'],
        sql`SELECT COUNT(*)::int AS so_cong_doan FROM production_job_operations
          WHERE type::text = ${reqDto.type}`,
      );
    }
    return this.queryService.run(
      'operations_by_type',
      ['type', 'so_cong_doan'],
      sql`SELECT type::text AS type, COUNT(*)::int AS so_cong_doan
        FROM production_job_operations GROUP BY type ORDER BY so_cong_doan DESC`,
    );
  }

  summarizeProduction(
    reqDto: ProductionSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const combination = `${reqDto.entity}+${reqDto.groupBy}`;
    switch (combination) {
      case `${ProductionSummaryEntity.JOBS}+${ProductionSummaryGroupBy.STATUS}`:
        return this.countJobsByStatus(reqDto);
      case `${ProductionSummaryEntity.JOBS}+${ProductionSummaryGroupBy.ITEM}`:
        return this.countJobsByItem(reqDto);
      case `${ProductionSummaryEntity.PRODUCTION_ORDERS}+${ProductionSummaryGroupBy.STATUS}`:
        return this.countProductionOrdersByStatus(reqDto);
      case `${ProductionSummaryEntity.OPERATIONS}+${ProductionSummaryGroupBy.TYPE}`:
        return this.countOperationsByType(reqDto);
      case `${ProductionSummaryEntity.OUTSOURCING_ORDERS}+${ProductionSummaryGroupBy.STATUS}`:
        return this.countOutsourcingOrdersByStatus(reqDto);
      case `${ProductionSummaryEntity.OUTSOURCING_ORDERS}+${ProductionSummaryGroupBy.SUPPLIER}`:
        return this.countOutsourcingOrdersBySupplier(reqDto);
      default:
        throw new UnprocessableEntityException(
          `groupBy=${reqDto.groupBy} không áp dụng cho entity=${reqDto.entity}`,
        );
    }
  }

  listProductionWatchlist(
    reqDto: ProductionWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    switch (reqDto.kind) {
      case ProductionWatchKind.LATE_OPERATIONS:
        return this.listLateOperations(reqDto);
      case ProductionWatchKind.OPEN_PRODUCTION_ORDERS:
        return this.listOpenProductionOrders(reqDto);
      case ProductionWatchKind.OVERDUE_OUTSOURCING:
        return this.listOverdueOutsourcing(reqDto);
    }
  }

  private countOutsourcingOrdersByStatus(
    reqDto: ProductionSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'production_summary',
      ['status', 'so_phieu'],
      (tx) =>
        tx
          .select({
            status: sql<string>`${outsourcingOrders.status}::text`,
            so_phieu: sql<number>`count(*)::int`,
          })
          .from(outsourcingOrders)
          .where(
            and(
              ...dateRangeConditions(
                vnTimestamp(outsourcingOrders.createdAt),
                reqDto,
              ),
            ),
          )
          .groupBy(outsourcingOrders.status)
          .orderBy(desc(sql`count(*)`), asc(outsourcingOrders.status)),
    );
  }

  private countOutsourcingOrdersBySupplier(
    reqDto: ProductionSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const filters = [
      ...dateRangeConditions(vnTimestamp(outsourcingOrders.createdAt), reqDto),
    ];
    if (reqDto.status) {
      filters.push(equalsText(outsourcingOrders.status, reqDto.status));
    }
    return this.queryService.query(
      'production_summary',
      ['name', 'so_phieu'],
      (tx) =>
        tx
          .select({
            name: suppliers.name,
            so_phieu: sql<number>`count(*)::int`,
          })
          .from(outsourcingOrders)
          .innerJoin(suppliers, eq(suppliers.id, outsourcingOrders.supplierId))
          .where(and(...filters))
          .groupBy(suppliers.name)
          .orderBy(desc(sql`count(*)`), asc(suppliers.name)),
    );
  }

  // Phiếu gửi gia công còn chờ hàng về mà đã quá ngày hẹn trả
  private listOverdueOutsourcing(
    reqDto: ProductionWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'production_watchlist',
      [
        'phieu_gia_cong',
        'nha_cung_cap',
        'ngay_hen_tra',
        'so_ngay_tre',
        'status',
      ],
      (tx) =>
        tx
          .select({
            phieu_gia_cong: outsourcingOrders.code,
            nha_cung_cap: suppliers.name,
            ngay_hen_tra: sql<string>`${outsourcingOrders.expectedReturnDate}::text`,
            so_ngay_tre: sql<number>`(${TODAY} - ${outsourcingOrders.expectedReturnDate})::int`,
            status: sql<string>`${outsourcingOrders.status}::text`,
          })
          .from(outsourcingOrders)
          .innerJoin(suppliers, eq(suppliers.id, outsourcingOrders.supplierId))
          .where(
            and(
              inTexts(outsourcingOrders.status, OPEN_OUTSOURCING_STATUSES),
              sql`${outsourcingOrders.expectedReturnDate} < ${TODAY}`,
            ),
          )
          .orderBy(asc(outsourcingOrders.expectedReturnDate))
          .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT),
    );
  }

  private countJobsByStatus(
    reqDto: ProductionSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'production_summary',
      ['status', 'so_job'],
      (tx) =>
        tx
          .select({
            status: sql<string>`${productionJobs.status}::text`,
            so_job: sql<number>`count(*)::int`,
          })
          .from(productionJobs)
          .where(
            and(
              ...dateRangeConditions(
                vnTimestamp(productionJobs.createdAt),
                reqDto,
              ),
            ),
          )
          .groupBy(productionJobs.status)
          .orderBy(desc(sql`count(*)`), asc(productionJobs.status)),
    );
  }

  private countJobsByItem(
    reqDto: ProductionSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'production_summary',
      ['code', 'name', 'so_job'],
      (tx) =>
        tx
          .select({
            code: items.code,
            name: items.name,
            so_job: sql<number>`count(*)::int`,
          })
          .from(productionJobs)
          .innerJoin(items, eq(items.id, productionJobs.itemId))
          .where(
            and(
              equalsText(
                productionJobs.status,
                reqDto.status ?? DEFAULT_JOB_STATUS,
              ),
              ...dateRangeConditions(
                vnTimestamp(productionJobs.createdAt),
                reqDto,
              ),
            ),
          )
          .groupBy(items.code, items.name)
          .orderBy(desc(sql`count(*)`), asc(items.code)),
    );
  }

  private countProductionOrdersByStatus(
    reqDto: ProductionSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'production_summary',
      ['status', 'so_lenh'],
      (tx) =>
        tx
          .select({
            status: sql<string>`${productionOrders.status}::text`,
            so_lenh: sql<number>`count(*)::int`,
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
          .orderBy(desc(sql`count(*)`), asc(productionOrders.status)),
    );
  }

  private countOperationsByType(
    reqDto: ProductionSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'production_summary',
      ['type', 'so_cong_doan'],
      (tx) =>
        tx
          .select({
            type: sql<string>`${productionJobOperations.type}::text`,
            so_cong_doan: sql<number>`count(*)::int`,
          })
          .from(productionJobOperations)
          .where(
            reqDto.type
              ? equalsText(productionJobOperations.type, reqDto.type)
              : undefined,
          )
          .groupBy(productionJobOperations.type)
          .orderBy(desc(sql`count(*)`), asc(productionJobOperations.type)),
    );
  }

  private listLateOperations(
    reqDto: ProductionWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    const filters: SQL[] = [
      sql`${productionJobOperations.dueDate} < ${TODAY}`,
      sql`coalesce(${productionJobOperations.completedQuantity}, 0) < ${productionJobs.quantity}`,
      sql`${productionJobs.status}::text <> 'COMPLETED'`,
      isNull(orders.deletedAt),
      sql`${orders.status}::text NOT IN ('CANCELLED', 'REJECTED')`,
    ];
    if (reqDto.staleDays) {
      // Công đoạn chưa từng báo cáo (NULL) cũng tính là lâu không có tiến độ
      filters.push(
        sql`(${productionJobOperations.lastReportedAt} IS NULL
          OR ${vnTimestamp(productionJobOperations.lastReportedAt)}::date < ${TODAY} - ${reqDto.staleDays}::int)`,
      );
    }
    return this.queryService.query(
      'production_watchlist',
      [
        'don_hang',
        'cong_viec',
        'cong_doan',
        'han',
        'so_ngay_tre',
        'da_lam',
        'so_luong',
      ],
      (tx) =>
        tx
          .select({
            don_hang: orders.code,
            cong_viec: productionJobs.code,
            cong_doan: productionJobOperations.name,
            han: sql<string>`${productionJobOperations.dueDate}::text`,
            so_ngay_tre: sql<number>`(${TODAY} - ${productionJobOperations.dueDate})::int`,
            da_lam: sql<number>`coalesce(${productionJobOperations.completedQuantity}, 0)::float8`,
            so_luong: sql<number>`${productionJobs.quantity}::float8`,
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
          .where(and(...filters))
          .orderBy(
            asc(productionJobOperations.dueDate),
            asc(productionJobs.code),
          )
          .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT),
    );
  }

  private listOpenProductionOrders(
    reqDto: ProductionWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'production_watchlist',
      ['lenh_san_xuat', 'don_hang', 'status'],
      (tx) =>
        tx
          .select({
            lenh_san_xuat: productionOrders.code,
            don_hang: orders.code,
            status: sql<string>`${productionOrders.status}::text`,
          })
          .from(productionOrders)
          .innerJoin(orders, eq(orders.id, productionOrders.orderId))
          .where(sql`${productionOrders.status}::text <> 'COMPLETED'`)
          .orderBy(asc(productionOrders.code))
          .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT),
    );
  }
}
