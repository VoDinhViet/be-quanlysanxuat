import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import {
  asNumber,
  asText,
  dateRangeAndStatusConditions,
} from '../../common/summary/summary.sql';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { supplierReturns, suppliers } from '../../database/schemas';
import { GetSupplierReturnSummaryReqDto } from './dto/get-supplier-return-summary.req.dto';
import { SupplierReturnSummaryResDto } from './dto/supplier-return-summary.res.dto';
import { SupplierReturnSummaryGroupBy } from './supplier-returns.constant';

@Injectable()
export class SupplierReturnsSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  getSummary(
    reqDto: GetSupplierReturnSummaryReqDto,
  ): Promise<SupplierReturnSummaryResDto[]> {
    if (reqDto.groupBy === SupplierReturnSummaryGroupBy.SUPPLIER) {
      return this.summarizeBySupplier(reqDto);
    }

    return this.summarizeByStatus(reqDto);
  }

  private summarizeByStatus(
    reqDto: GetSupplierReturnSummaryReqDto,
  ): Promise<SupplierReturnSummaryResDto[]> {
    return this.db
      .select({
        status: asText(supplierReturns.status),
        returnCount: sql<number>`count(*)::int`,
        totalQuantity: asNumber(sql`sum(${supplierReturns.quantity})`),
      })
      .from(supplierReturns)
      .where(and(...this.filters(reqDto)))
      .groupBy(supplierReturns.status)
      .orderBy(desc(sql`count(*)`), asc(supplierReturns.status));
  }

  // `limit` chỉ áp cho nhóm theo nhà cung cấp: số trạng thái thì có trần sẵn
  private summarizeBySupplier(
    reqDto: GetSupplierReturnSummaryReqDto,
  ): Promise<SupplierReturnSummaryResDto[]> {
    return this.db
      .select({
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        returnCount: sql<number>`count(*)::int`,
        totalQuantity: asNumber(sql`sum(${supplierReturns.quantity})`),
      })
      .from(supplierReturns)
      .innerJoin(suppliers, eq(suppliers.id, supplierReturns.supplierId))
      .where(and(...this.filters(reqDto)))
      .groupBy(suppliers.id, suppliers.name)
      .orderBy(desc(sql`count(*)`), asc(suppliers.name))
      .limit(limitOf(reqDto));
  }

  private filters(reqDto: GetSupplierReturnSummaryReqDto) {
    return dateRangeAndStatusConditions(
      sql`${supplierReturns.returnDate}`,
      supplierReturns.status,
      reqDto,
    );
  }
}
