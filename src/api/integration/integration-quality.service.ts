import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { qualityInspections, suppliers } from '../../database/schemas';

import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  IqcFailBySupplierReqDto,
  OpenNcrReqDto,
  QualityInspectionRateReqDto,
  QualityRateGroupBy,
} from './dto/integration-quality.req.dto';
import {
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
const INSPECTION_DONE_AT = sql`COALESCE(${qualityInspections.completedAt}, ${qualityInspections.updatedAt})`;

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
        ${qualityInspections.status}::text AS status, (${TODAY} - ${qualityInspections.createdAt}::date)::int AS so_ngay_ton
        FROM ${qualityInspections}
        WHERE ${qualityInspections.decision}::text = 'FAIL' AND ${qualityInspections.status}::text <> 'CANCELLED'
        AND (${qualityInspections.status}::text <> 'COMPLETED' OR ${qualityInspections.disposition} IS NULL)
        AND ${TODAY} - ${qualityInspections.createdAt}::date >= ${reqDto.minAgeDays ?? 0}::int
        ORDER BY so_ngay_ton DESC LIMIT ${reqDto.limit ?? DEFAULT_LIST_LIMIT}`,
    );
  }
}
