import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import {
  asNumber,
  asText,
  dateRangeAndStatusConditions,
  daysSince,
  TODAY,
} from '../../common/summary/summary.sql';
import { vnTimestamp } from '../../common/utils/time';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  paymentRequests,
  PaymentRequestStatus,
  purchaseOrders,
  suppliers,
} from '../../database/schemas';
import { GetOverduePaymentRequestsReqDto } from './dto/get-overdue-payment-requests.req.dto';
import { GetPaymentRequestValueSummaryReqDto } from './dto/get-payment-request-value-summary.req.dto';
import { OverduePaymentRequestResDto } from './dto/overdue-payment-request.res.dto';
import { PaymentRequestValueSummaryResDto } from './dto/payment-request-value-summary.res.dto';

// PAID và CANCELLED đã xong nên không bao giờ "quá hạn"
const UNPAID_OPEN_STATUSES: PaymentRequestStatus[] = [
  PaymentRequestStatus.DRAFT,
  PaymentRequestStatus.PENDING,
  PaymentRequestStatus.REJECTED,
];

@Injectable()
export class PaymentRequestsSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  getOverduePaymentRequests(
    reqDto: GetOverduePaymentRequestsReqDto,
  ): Promise<OverduePaymentRequestResDto[]> {
    return this.db
      .select({
        id: paymentRequests.id,
        code: paymentRequests.code,
        supplierName: suppliers.name,
        dueDate: asText(paymentRequests.dueDate),
        daysOverdue: daysSince(paymentRequests.dueDate),
        requestedAmount: asNumber(paymentRequests.requestedAmount),
      })
      .from(paymentRequests)
      .innerJoin(
        purchaseOrders,
        eq(purchaseOrders.id, paymentRequests.purchaseOrderId),
      )
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(
        and(
          inArray(paymentRequests.status, UNPAID_OPEN_STATUSES),
          sql`${paymentRequests.dueDate} < ${TODAY}`,
        ),
      )
      .orderBy(asc(paymentRequests.dueDate), asc(paymentRequests.code))
      .limit(limitOf(reqDto));
  }

  getValueSummary(
    reqDto: GetPaymentRequestValueSummaryReqDto,
  ): Promise<PaymentRequestValueSummaryResDto[]> {
    const totalValue = sql<number>`sum(${paymentRequests.requestedAmount})::float8`;

    return this.db
      .select({
        status: asText(paymentRequests.status),
        requestCount: sql<number>`count(*)::int`,
        totalValue,
      })
      .from(paymentRequests)
      .where(
        and(
          ...dateRangeAndStatusConditions(
            vnTimestamp(paymentRequests.createdAt),
            paymentRequests.status,
            reqDto,
          ),
        ),
      )
      .groupBy(paymentRequests.status)
      .orderBy(desc(totalValue), asc(paymentRequests.status));
  }
}
