import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { qualityInspections, suppliers } from '../../database/schemas';
import { vnTimestamp } from '../../common/utils/time';

import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  IqcFailBySupplierReqDto,
  OpenNcrReqDto,
  QualityInspectionRateReqDto,
  QualityRateGroupBy,
  QualitySummaryGroupBy,
  QualitySummaryReqDto,
  QualityWatchlistReqDto,
} from './dto/integration-quality.req.dto';
import {
  equalsText,
  IntegrationQueryService,
  TODAY,
  whereClause,
} from './integration-query.service';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_IQC_SINCE_DAYS = 90;
const DEFAULT_IQC_MIN_INSPECTIONS = 3;
const DEFAULT_IQC_LIMIT = 10;

// `completed_at` chưa được ghi ở dữ liệu thật của ERP, nên thời điểm phiếu kiểm xong lấy lần cập
// nhật cuối của phiếu
const INSPECTION_DONE_AT = vnTimestamp(
  sql`COALESCE(${qualityInspections.completedAt}, ${qualityInspections.updatedAt})`,
);

const INSPECTION_CREATED_DAY = sql`${vnTimestamp(qualityInspections.createdAt)}::date`;

@Injectable()
export class IntegrationQualityService {
  constructor(private readonly queryService: IntegrationQueryService) {}

  qualityInspectionRate(
    reqDto: QualityInspectionRateReqDto,
  ): Promise<IntegrationResultResDto> {
    const conditions: SQL[] = [
      sql`${qualityInspections.status}::text = 'COMPLETED'`,
    ];
    if (reqDto.sinceDays) {
      conditions.push(
        sql`${INSPECTION_DONE_AT} >= ${TODAY} - ${reqDto.sinceDays}::int`,
      );
    }
    const where = whereClause(conditions);
    const groupBy = reqDto.groupBy ?? QualityRateGroupBy.DECISION;

    if (groupBy === QualityRateGroupBy.DAY) {
      return this.queryService.run(
        'quality_inspection_rate',
        ['ngay', 'decision', 'so_phieu'],
        sql`SELECT to_char(DATE_TRUNC('day', ${INSPECTION_DONE_AT}), 'YYYY-MM-DD') AS ngay,
          ${qualityInspections.decision}::text AS decision, COUNT(*)::int AS so_phieu
          FROM ${qualityInspections} ${where}
          GROUP BY DATE_TRUNC('day', ${INSPECTION_DONE_AT}), ${qualityInspections.decision}
          ORDER BY ngay, ${qualityInspections.decision}`,
      );
    }
    if (groupBy === QualityRateGroupBy.SUPPLIER) {
      return this.queryService.run(
        'quality_inspection_rate',
        ['nha_cung_cap', 'decision', 'so_phieu'],
        sql`SELECT ${suppliers.name} AS nha_cung_cap, ${qualityInspections.decision}::text AS decision,
          COUNT(*)::int AS so_phieu
          FROM ${qualityInspections} JOIN ${suppliers} ON ${suppliers.id} = ${qualityInspections.supplierId} ${where}
          GROUP BY ${suppliers.name}, ${qualityInspections.decision} ORDER BY ${suppliers.name}, ${qualityInspections.decision}`,
      );
    }
    if (groupBy === QualityRateGroupBy.TYPE) {
      return this.queryService.run(
        'quality_inspection_rate',
        ['inspection_type', 'decision', 'so_phieu'],
        sql`SELECT ${qualityInspections.inspectionType}::text AS inspection_type,
          ${qualityInspections.decision}::text AS decision, COUNT(*)::int AS so_phieu
          FROM ${qualityInspections} ${where}
          GROUP BY ${qualityInspections.inspectionType}, ${qualityInspections.decision}
          ORDER BY ${qualityInspections.inspectionType}, ${qualityInspections.decision}`,
      );
    }
    return this.queryService.run(
      'quality_inspection_rate',
      ['decision', 'so_phieu'],
      sql`SELECT ${qualityInspections.decision}::text AS decision, COUNT(*)::int AS so_phieu
        FROM ${qualityInspections} ${where}
        GROUP BY ${qualityInspections.decision} ORDER BY ${qualityInspections.decision}`,
    );
  }

  iqcFailBySupplier(
    reqDto: IqcFailBySupplierReqDto,
  ): Promise<IntegrationResultResDto> {
    const failCount = sql`SUM(CASE WHEN ${qualityInspections.decision}::text = 'FAIL' THEN 1 ELSE 0 END)`;
    return this.queryService.run(
      'iqc_fail_by_supplier',
      ['nha_cung_cap', 'so_lan_kiem', 'so_lan_khong_dat', 'ty_le_khong_dat'],
      sql`SELECT ${suppliers.name} AS nha_cung_cap, COUNT(*)::int AS so_lan_kiem,
        ${failCount}::int AS so_lan_khong_dat,
        ROUND(100.0 * ${failCount} / COUNT(*), 1)::float8 AS ty_le_khong_dat
        FROM ${qualityInspections} JOIN ${suppliers} ON ${suppliers.id} = ${qualityInspections.supplierId}
        WHERE ${qualityInspections.inspectionType}::text = 'IQC' AND ${qualityInspections.status}::text = 'COMPLETED'
        AND ${INSPECTION_DONE_AT} >= ${TODAY} - ${reqDto.sinceDays ?? DEFAULT_IQC_SINCE_DAYS}::int
        AND ${suppliers.deletedAt} IS NULL
        GROUP BY ${suppliers.name}
        HAVING COUNT(*) >= ${reqDto.minInspections ?? DEFAULT_IQC_MIN_INSPECTIONS}::int
        AND ${failCount} > 0
        ORDER BY ty_le_khong_dat DESC, so_lan_kiem DESC
        LIMIT ${reqDto.limit ?? DEFAULT_IQC_LIMIT}`,
    );
  }

  openNcr(reqDto: OpenNcrReqDto): Promise<IntegrationResultResDto> {
    return this.queryService.run(
      'open_ncr',
      ['phieu_kiem', 'loai', 'ma_vat_tu', 'so_luong', 'status', 'so_ngay_ton'],
      sql`SELECT ${qualityInspections.inspectionNo} AS phieu_kiem, ${qualityInspections.inspectionType}::text AS loai,
        ${qualityInspections.itemCode} AS ma_vat_tu, ${qualityInspections.quantity}::float8 AS so_luong,
        ${qualityInspections.status}::text AS status, (${TODAY} - ${INSPECTION_CREATED_DAY})::int AS so_ngay_ton
        FROM ${qualityInspections}
        WHERE ${qualityInspections.decision}::text = 'FAIL' AND ${qualityInspections.status}::text <> 'CANCELLED'
        AND (${qualityInspections.status}::text <> 'COMPLETED' OR ${qualityInspections.disposition} IS NULL)
        AND ${TODAY} - ${INSPECTION_CREATED_DAY} >= ${reqDto.minAgeDays ?? 0}::int
        ORDER BY so_ngay_ton DESC LIMIT ${reqDto.limit ?? DEFAULT_LIST_LIMIT}`,
    );
  }

  summarizeQuality(
    reqDto: QualitySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    switch (reqDto.groupBy) {
      case QualitySummaryGroupBy.DECISION:
        return this.countInspectionsByDecision(reqDto);
      case QualitySummaryGroupBy.DAY:
        return this.countInspectionsByDay(reqDto);
      case QualitySummaryGroupBy.SUPPLIER:
        return this.countInspectionsBySupplier(reqDto);
      case QualitySummaryGroupBy.TYPE:
        return this.countInspectionsByType(reqDto);
      case QualitySummaryGroupBy.SUPPLIER_FAIL_RATE:
        return this.rankSuppliersByFailRate(reqDto);
    }
  }

  listQualityWatchlist(
    reqDto: QualityWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'quality_watchlist',
      ['phieu_kiem', 'loai', 'ma_vat_tu', 'so_luong', 'status', 'so_ngay_ton'],
      (tx) =>
        tx
          .select({
            phieu_kiem: qualityInspections.inspectionNo,
            loai: sql<string>`${qualityInspections.inspectionType}::text`,
            ma_vat_tu: qualityInspections.itemCode,
            so_luong: sql<number>`${qualityInspections.quantity}::float8`,
            status: sql<string>`${qualityInspections.status}::text`,
            so_ngay_ton: sql<number>`(${TODAY} - ${INSPECTION_CREATED_DAY})::int`,
          })
          .from(qualityInspections)
          .where(
            and(
              equalsText(qualityInspections.decision, 'FAIL'),
              sql`${qualityInspections.status}::text <> 'CANCELLED'`,
              or(
                sql`${qualityInspections.status}::text <> 'COMPLETED'`,
                isNull(qualityInspections.disposition),
              ),
              sql`${TODAY} - ${INSPECTION_CREATED_DAY} >= ${reqDto.minAgeDays ?? 0}::int`,
            ),
          )
          .orderBy(
            asc(INSPECTION_CREATED_DAY),
            asc(qualityInspections.inspectionNo),
          )
          .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT),
    );
  }

  private buildCompletedFilters(reqDto: QualitySummaryReqDto): SQL[] {
    const filters: SQL[] = [equalsText(qualityInspections.status, 'COMPLETED')];
    if (reqDto.sinceDays) {
      filters.push(
        sql`${INSPECTION_DONE_AT} >= ${TODAY} - ${reqDto.sinceDays}::int`,
      );
    }
    return filters;
  }

  private countInspectionsByDecision(
    reqDto: QualitySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'quality_summary',
      ['decision', 'so_phieu'],
      (tx) =>
        tx
          .select({
            decision: sql<string>`${qualityInspections.decision}::text`,
            so_phieu: sql<number>`count(*)::int`,
          })
          .from(qualityInspections)
          .where(and(...this.buildCompletedFilters(reqDto)))
          .groupBy(qualityInspections.decision)
          .orderBy(asc(qualityInspections.decision)),
    );
  }

  private countInspectionsByDay(
    reqDto: QualitySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const day = sql<string>`to_char(date_trunc('day', ${INSPECTION_DONE_AT}), 'YYYY-MM-DD')`;
    return this.queryService.query(
      'quality_summary',
      ['ngay', 'decision', 'so_phieu'],
      (tx) =>
        tx
          .select({
            ngay: day,
            decision: sql<string>`${qualityInspections.decision}::text`,
            so_phieu: sql<number>`count(*)::int`,
          })
          .from(qualityInspections)
          .where(and(...this.buildCompletedFilters(reqDto)))
          .groupBy(day, qualityInspections.decision)
          .orderBy(asc(day), asc(qualityInspections.decision)),
    );
  }

  private countInspectionsBySupplier(
    reqDto: QualitySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'quality_summary',
      ['nha_cung_cap', 'decision', 'so_phieu'],
      (tx) =>
        tx
          .select({
            nha_cung_cap: suppliers.name,
            decision: sql<string>`${qualityInspections.decision}::text`,
            so_phieu: sql<number>`count(*)::int`,
          })
          .from(qualityInspections)
          .innerJoin(suppliers, eq(suppliers.id, qualityInspections.supplierId))
          .where(and(...this.buildCompletedFilters(reqDto)))
          .groupBy(suppliers.name, qualityInspections.decision)
          .orderBy(asc(suppliers.name), asc(qualityInspections.decision)),
    );
  }

  private countInspectionsByType(
    reqDto: QualitySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'quality_summary',
      ['inspection_type', 'decision', 'so_phieu'],
      (tx) =>
        tx
          .select({
            inspection_type: sql<string>`${qualityInspections.inspectionType}::text`,
            decision: sql<string>`${qualityInspections.decision}::text`,
            so_phieu: sql<number>`count(*)::int`,
          })
          .from(qualityInspections)
          .where(and(...this.buildCompletedFilters(reqDto)))
          .groupBy(
            qualityInspections.inspectionType,
            qualityInspections.decision,
          )
          .orderBy(
            asc(qualityInspections.inspectionType),
            asc(qualityInspections.decision),
          ),
    );
  }

  private rankSuppliersByFailRate(
    reqDto: QualitySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const failCount = sql<number>`sum(CASE WHEN ${qualityInspections.decision}::text = 'FAIL' THEN 1 ELSE 0 END)`;
    const failRate = sql<number>`round(100.0 * ${failCount} / count(*), 1)`;
    return this.queryService.query(
      'quality_summary',
      ['nha_cung_cap', 'so_lan_kiem', 'so_lan_khong_dat', 'ty_le_khong_dat'],
      (tx) =>
        tx
          .select({
            nha_cung_cap: suppliers.name,
            so_lan_kiem: sql<number>`count(*)::int`,
            so_lan_khong_dat: sql<number>`${failCount}::int`,
            ty_le_khong_dat: sql<number>`${failRate}::float8`,
          })
          .from(qualityInspections)
          .innerJoin(suppliers, eq(suppliers.id, qualityInspections.supplierId))
          .where(
            and(
              equalsText(qualityInspections.inspectionType, 'IQC'),
              ...this.buildCompletedFilters({
                ...reqDto,
                sinceDays: reqDto.sinceDays ?? DEFAULT_IQC_SINCE_DAYS,
              }),
              isNull(suppliers.deletedAt),
            ),
          )
          .groupBy(suppliers.name)
          .having(
            and(
              sql`count(*) >= ${reqDto.minInspections ?? DEFAULT_IQC_MIN_INSPECTIONS}::int`,
              sql`${failCount} > 0`,
            ),
          )
          .orderBy(desc(failRate), desc(sql`count(*)`), asc(suppliers.name))
          .limit(reqDto.limit ?? DEFAULT_IQC_LIMIT),
    );
  }
}
