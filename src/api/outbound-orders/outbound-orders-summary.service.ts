import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, sql } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import { asText, TODAY } from '../../common/summary/summary.sql';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  clients,
  outboundOrders,
  OutboundOrderStatus,
} from '../../database/schemas';
import { GetPendingDeliveryOutboundOrdersReqDto } from './dto/get-pending-delivery-outbound-orders.req.dto';
import { PendingDeliveryOutboundOrderResDto } from './dto/pending-delivery-outbound-order.res.dto';
import { DEFAULT_PENDING_DELIVERY_DAYS_AHEAD } from './outbound-orders-summary.constant';

@Injectable()
export class OutboundOrdersSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPendingDeliveryOutboundOrders(
    reqDto: GetPendingDeliveryOutboundOrdersReqDto,
  ): Promise<PendingDeliveryOutboundOrderResDto[]> {
    const daysAhead = reqDto.daysAhead ?? DEFAULT_PENDING_DELIVERY_DAYS_AHEAD;

    const pendingOutboundOrders = await this.db
      .select({
        id: outboundOrders.id,
        code: outboundOrders.code,
        clientName: clients.name,
        fulfillmentDate: asText(outboundOrders.fulfillmentDate),
        daysRemaining: sql<number>`(${outboundOrders.fulfillmentDate} - ${TODAY})::int`,
      })
      .from(outboundOrders)
      .innerJoin(clients, eq(clients.id, outboundOrders.clientId))
      .where(
        and(
          eq(outboundOrders.status, OutboundOrderStatus.PENDING_DELIVERY),
          sql`${outboundOrders.fulfillmentDate} <= ${TODAY} + ${daysAhead}::int`,
        ),
      )
      .orderBy(asc(outboundOrders.fulfillmentDate), asc(outboundOrders.code))
      .limit(limitOf(reqDto));

    return plainToInstance(
      PendingDeliveryOutboundOrderResDto,
      pendingOutboundOrders,
      { excludeExtraneousValues: true },
    );
  }
}
