import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, sql } from 'drizzle-orm';

import { asText, dateRangeConditions } from '../../common/summary/summary.sql';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { inventoryReceipts } from '../../database/schemas';
import { GetInventoryReceiptStatusStatsReqDto } from './dto/get-inventory-receipt-status-stats.req.dto';
import { InventoryReceiptStatusStatResDto } from './dto/inventory-receipt-status-stat.res.dto';

@Injectable()
export class InventoryReceiptsSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getReceiptStatusStats(
    reqDto: GetInventoryReceiptStatusStatsReqDto,
  ): Promise<InventoryReceiptStatusStatResDto[]> {
    // Ép text để enum Postgres luôn ra chuỗi và sắp xếp ổn định theo tên
    const receiptType = asText(inventoryReceipts.receiptType);
    const status = asText(inventoryReceipts.status);

    const receiptCounts = await this.db
      .select({
        receiptType,
        status,
        receiptCount: sql<number>`count(*)::int`,
      })
      .from(inventoryReceipts)
      .where(and(...dateRangeConditions(inventoryReceipts.receiptDate, reqDto)))
      .groupBy(inventoryReceipts.receiptType, inventoryReceipts.status)
      .orderBy(asc(receiptType), asc(status));

    return plainToInstance(InventoryReceiptStatusStatResDto, receiptCounts, {
      excludeExtraneousValues: true,
    });
  }
}
