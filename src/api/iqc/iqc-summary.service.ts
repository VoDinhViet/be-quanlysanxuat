import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import {
  asNumber,
  asText,
  daysSince,
  TODAY,
  whereClause,
} from '../../common/summary/summary.sql';
import { vnTimestamp } from '../../common/utils/time';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  qualityInspections,
  QualityInspectionDecision,
  QualityInspectionStatus,
  QualityInspectionType,
  suppliers,
} from '../../database/schemas';
import {
  GetIqcInspectionRateReqDto,
  IqcInspectionRateGroupBy,
} from './dto/get-iqc-inspection-rate.req.dto';
import { GetIqcSupplierFailRateReqDto } from './dto/get-iqc-supplier-fail-rate.req.dto';
import { GetOpenIqcFailuresReqDto } from './dto/get-open-iqc-failures.req.dto';
import { IqcInspectionRateResDto } from './dto/iqc-inspection-rate.res.dto';
import { IqcSupplierFailRateResDto } from './dto/iqc-supplier-fail-rate.res.dto';
import { OpenIqcFailureResDto } from './dto/open-iqc-failure.res.dto';
import {
  DEFAULT_FAIL_RATE_SINCE_DAYS,
  DEFAULT_MIN_INSPECTIONS,
  INSPECTION_RATE_MAX_ROWS,
} from './iqc-summary.constant';
import { isActiveFailedInspection } from './iqc.predicate';

// `completed_at` chưa được ghi ở dữ liệu thật của ERP, nên thời điểm phiếu kiểm xong lấy lần cập
// nhật cuối của phiếu
const INSPECTION_DONE_AT = vnTimestamp(
  sql`COALESCE(${qualityInspections.completedAt}, ${qualityInspections.updatedAt})`,
);

const INSPECTION_CREATED_DAY = sql`${vnTimestamp(qualityInspections.createdAt)}::date`;

type InspectionRateDimension = {
  field: 'day' | 'supplierName';
  valueSql: SQL;
  groupSql: SQL;
  orderSql: SQL;
};

const INSPECTION_DAY = sql`to_char(date_trunc('day', ${INSPECTION_DONE_AT}), 'YYYY-MM-DD')`;
const SUPPLIER_GROUP = sql`${suppliers.id}, ${suppliers.name}`;

// Cột nhóm thêm vào `decision`; `decision` thì không cần cột nào. Theo ngày xếp mới nhất trước để
// trần `INSPECTION_RATE_MAX_ROWS` cắt các ngày cũ nhất. Nhóm theo `suppliers.id` để hai nhà cung
// cấp trùng tên không bị gộp.
const INSPECTION_RATE_DIMENSIONS: Partial<
  Record<IqcInspectionRateGroupBy, InspectionRateDimension>
> = {
  [IqcInspectionRateGroupBy.DAY]: {
    field: 'day',
    valueSql: INSPECTION_DAY,
    groupSql: INSPECTION_DAY,
    orderSql: sql`${INSPECTION_DAY} DESC`,
  },
  [IqcInspectionRateGroupBy.SUPPLIER]: {
    field: 'supplierName',
    valueSql: sql`${suppliers.name}`,
    groupSql: SUPPLIER_GROUP,
    orderSql: sql`${suppliers.name}, ${suppliers.id}`,
  },
};

type InspectionRateRecord = {
  groupValue?: string;
  decision: string | null;
  inspectionCount: number;
};

@Injectable()
export class IqcSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getInspectionRate(
    reqDto: GetIqcInspectionRateReqDto,
  ): Promise<IqcInspectionRateResDto[]> {
    const groupBy = reqDto.groupBy ?? IqcInspectionRateGroupBy.DECISION;
    const dimension = INSPECTION_RATE_DIMENSIONS[groupBy];
    const inspectionRates = await this.db.execute<InspectionRateRecord>(
      this.buildInspectionRateQuery(dimension, reqDto.sinceDays),
    );

    return inspectionRates.map((inspectionRate) => ({
      decision: inspectionRate.decision,
      inspectionCount: inspectionRate.inspectionCount,
      ...(dimension && { [dimension.field]: inspectionRate.groupValue }),
    }));
  }

  getSupplierFailRate(
    reqDto: GetIqcSupplierFailRateReqDto,
  ): Promise<IqcSupplierFailRateResDto[]> {
    const failCount = sql<number>`count(*) FILTER (WHERE ${eq(qualityInspections.decision, QualityInspectionDecision.FAIL)})`;
    const failRate = sql<number>`round(100.0 * ${failCount} / count(*), 1)`;
    const sinceDays = reqDto.sinceDays ?? DEFAULT_FAIL_RATE_SINCE_DAYS;
    const minInspections = reqDto.minInspections ?? DEFAULT_MIN_INSPECTIONS;

    return this.db
      .select({
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        inspectionCount: sql<number>`count(*)::int`,
        failCount: sql<number>`${failCount}::int`,
        failRate: sql<number>`${failRate}::float8`,
      })
      .from(qualityInspections)
      .innerJoin(suppliers, eq(suppliers.id, qualityInspections.supplierId))
      .where(
        and(
          ...this.completedIqcConditions(sinceDays),
          isNull(suppliers.deletedAt),
        ),
      )
      .groupBy(suppliers.id, suppliers.name)
      .having(
        and(sql`count(*) >= ${minInspections}::int`, sql`${failCount} > 0`),
      )
      .orderBy(desc(failRate), desc(sql`count(*)`), asc(suppliers.name))
      .limit(limitOf(reqDto));
  }

  /**
   * Phiếu IQC không đạt chưa xong, hoặc xong nhưng chưa có cách xử lý. Đọc thẳng
   * `quality_inspections`, khác bảng `ncrs` của `GET /ncrs`.
   */
  getOpenIqcFailures(
    reqDto: GetOpenIqcFailuresReqDto,
  ): Promise<OpenIqcFailureResDto[]> {
    const ageDays = daysSince(INSPECTION_CREATED_DAY);

    return this.db
      .select({
        id: qualityInspections.id,
        inspectionNo: qualityInspections.inspectionNo,
        inspectionType: asText(qualityInspections.inspectionType),
        itemCode: qualityInspections.itemCode,
        quantity: asNumber(qualityInspections.quantity),
        status: asText(qualityInspections.status),
        ageDays,
      })
      .from(qualityInspections)
      .where(
        and(
          eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
          isActiveFailedInspection(),
          or(
            ne(qualityInspections.status, QualityInspectionStatus.COMPLETED),
            isNull(qualityInspections.disposition),
          ),
          sql`${ageDays} >= ${reqDto.minAgeDays ?? 0}::int`,
        ),
      )
      .orderBy(desc(ageDays), asc(qualityInspections.inspectionNo))
      .limit(limitOf(reqDto));
  }

  private completedIqcConditions(sinceDays?: number): SQL[] {
    const conditions = [
      eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
      eq(qualityInspections.status, QualityInspectionStatus.COMPLETED),
    ];
    if (sinceDays) {
      conditions.push(
        sql`${INSPECTION_DONE_AT} >= ${TODAY} - ${sinceDays}::int`,
      );
    }
    return conditions;
  }

  private buildInspectionRateQuery(
    dimension: InspectionRateDimension | undefined,
    sinceDays?: number,
  ): SQL {
    const supplierJoin =
      dimension?.field === 'supplierName'
        ? sql`JOIN ${suppliers} ON ${suppliers.id} = ${qualityInspections.supplierId} AND ${isNull(suppliers.deletedAt)}`
        : sql``;
    const groupSelect = dimension
      ? sql`${dimension.valueSql} AS "groupValue",`
      : sql``;
    const groupColumns = dimension ? sql`${dimension.groupSql},` : sql``;
    const orderColumns = dimension ? sql`${dimension.orderSql},` : sql``;

    return sql`SELECT ${groupSelect} ${qualityInspections.decision}::text AS decision,
      COUNT(*)::int AS "inspectionCount"
      FROM ${qualityInspections} ${supplierJoin}
      ${whereClause(this.completedIqcConditions(sinceDays))}
      GROUP BY ${groupColumns} ${qualityInspections.decision}
      ORDER BY ${orderColumns} ${qualityInspections.decision}
      LIMIT ${INSPECTION_RATE_MAX_ROWS}`;
  }
}
