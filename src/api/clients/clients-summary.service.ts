import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { clients } from '../../database/schemas';
import { ClientStatusStatResDto } from './dto/client-status-stat.res.dto';
import { GetClientStatusStatsReqDto } from './dto/get-client-status-stats.req.dto';

@Injectable()
export class ClientsSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getClientStatusStats(
    reqDto: GetClientStatusStatsReqDto,
  ): Promise<ClientStatusStatResDto[]> {
    const clientCount = sql<number>`count(*)::int`;

    const statusStats = await this.db
      .select({ status: clients.status, clientCount })
      .from(clients)
      .where(
        and(
          isNull(clients.deletedAt),
          reqDto.status ? eq(clients.status, reqDto.status) : undefined,
        ),
      )
      .groupBy(clients.status)
      .orderBy(desc(clientCount));

    return plainToInstance(ClientStatusStatResDto, statusStats, {
      excludeExtraneousValues: true,
    });
  }
}
