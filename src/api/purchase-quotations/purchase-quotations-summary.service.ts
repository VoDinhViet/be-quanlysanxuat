import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, sql } from 'drizzle-orm';

import { asText, dateRangeConditions } from '../../common/summary/summary.sql';
import { vnTimestamp } from '../../common/utils/time';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { purchaseQuotations } from '../../database/schemas';
import { GetQuotationStatusStatsReqDto } from './dto/get-quotation-status-stats.req.dto';
import { QuotationStatusStatResDto } from './dto/quotation-status-stat.res.dto';

@Injectable()
export class PurchaseQuotationsSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  getStatusStats(
    reqDto: GetQuotationStatusStatsReqDto,
  ): Promise<QuotationStatusStatResDto[]> {
    return this.db
      .select({
        status: asText(purchaseQuotations.status),
        quotationCount: sql<number>`count(*)::int`,
      })
      .from(purchaseQuotations)
      .where(
        and(
          ...dateRangeConditions(
            vnTimestamp(purchaseQuotations.createdAt),
            reqDto,
          ),
        ),
      )
      .groupBy(purchaseQuotations.status)
      .orderBy(desc(sql`count(*)`), asc(purchaseQuotations.status));
  }
}
