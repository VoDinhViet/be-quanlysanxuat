import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import {
  items,
  orders,
  productionJobOperations,
  productionJobs,
  productionOrders,
} from '../../database/schemas';

import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  LateJobOperationsReqDto,
  OperationsByTypeReqDto,
  ProductionJobsByItemReqDto,
} from './dto/integration-production.req.dto';
import {
  IntegrationQueryService,
  TODAY,
  whereClause,
} from './integration-query.service';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_JOB_STATUS = 'COMPLETED';

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
          OR ${productionJobOperations.lastReportedAt}::date < ${TODAY} - ${reqDto.staleDays}::int)`,
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
}
