import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import { asText, daysSince } from '../../common/summary/summary.sql';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  purchaseOrderItems,
  purchaseOrders,
  PurchaseOrderStatus,
  purchaseRequestItems,
  purchaseRequests,
  PurchaseRequestStatus,
} from '../../database/schemas';
import { GetStuckPurchaseRequestsReqDto } from './dto/get-stuck-purchase-requests.req.dto';
import { StuckPurchaseRequestResDto } from './dto/stuck-purchase-request.res.dto';

@Injectable()
export class PurchaseRequestsSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Dòng đề nghị còn hiệu lực mà chưa nằm trong đơn mua nào chưa huỷ
  getStuckPurchaseRequests(
    reqDto: GetStuckPurchaseRequestsReqDto,
  ): Promise<StuckPurchaseRequestResDto[]> {
    const orderedRequestLines = this.orderedRequestLines();

    return this.db
      .select({
        id: purchaseRequests.id,
        code: purchaseRequests.code,
        neededDate: asText(purchaseRequests.neededDate),
        daysOverdue: daysSince(purchaseRequests.neededDate),
        unorderedLineCount: sql<number>`count(*)::int`,
        unorderedQuantity: sql<number>`sum(${purchaseRequestItems.quantity})::float8`,
      })
      .from(purchaseRequests)
      .innerJoin(
        purchaseRequestItems,
        eq(purchaseRequestItems.purchaseRequestId, purchaseRequests.id),
      )
      .leftJoin(
        orderedRequestLines,
        eq(orderedRequestLines.purchaseRequestItemId, purchaseRequestItems.id),
      )
      .where(
        and(
          eq(purchaseRequests.status, PurchaseRequestStatus.APPROVED),
          isNull(purchaseRequestItems.cancelledAt),
          isNull(orderedRequestLines.purchaseRequestItemId),
        ),
      )
      .groupBy(
        purchaseRequests.id,
        purchaseRequests.code,
        purchaseRequests.neededDate,
      )
      .orderBy(asc(purchaseRequests.neededDate), asc(purchaseRequests.code))
      .limit(limitOf(reqDto));
  }

  private orderedRequestLines() {
    return this.db
      .select({
        purchaseRequestItemId: purchaseOrderItems.purchaseRequestItemId,
      })
      .from(purchaseOrderItems)
      .innerJoin(
        purchaseOrders,
        eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId),
      )
      .where(ne(purchaseOrders.status, PurchaseOrderStatus.CANCELLED))
      .as('ordered');
  }
}
