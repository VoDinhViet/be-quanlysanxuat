import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import { asNumber } from '../../common/summary/summary.sql';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { inventoryBalances, items } from '../../database/schemas';
import {
  GetStockRankingReqDto,
  StockRankingOrder,
} from './dto/get-stock-ranking.req.dto';
import { StockRankingResDto } from './dto/stock-ranking.res.dto';

@Injectable()
export class InventorySummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getStockRanking(
    reqDto: GetStockRankingReqDto,
  ): Promise<StockRankingResDto[]> {
    const rankedBalances = await this.db
      .select({
        id: items.id,
        code: items.code,
        name: items.name,
        quantity: asNumber(inventoryBalances.quantity),
        minStock: asNumber(items.minStock),
      })
      .from(inventoryBalances)
      .innerJoin(items, eq(items.id, inventoryBalances.itemId))
      .where(and(...this.stockRankingConditions(reqDto)))
      .orderBy(this.quantityOrder(reqDto), asc(items.code))
      .limit(limitOf(reqDto));

    return plainToInstance(StockRankingResDto, rankedBalances, {
      excludeExtraneousValues: true,
    });
  }

  private stockRankingConditions(reqDto: GetStockRankingReqDto): SQL[] {
    const conditions: SQL[] = [isNull(items.deletedAt)];
    // Dưới mức tối thiểu gồm cả vật tư hết hàng nên không áp bộ lọc còn hàng
    if (reqDto.belowMinStock) {
      return [
        ...conditions,
        gt(items.minStock, 0),
        lt(inventoryBalances.quantity, items.minStock),
      ];
    }
    // Xếp thấp nhất mà không loại dòng hết hàng thì toàn dòng tồn bằng 0, vô nghĩa
    if (reqDto.inStockOnly || reqDto.order === StockRankingOrder.LOWEST) {
      return [...conditions, gt(inventoryBalances.quantity, 0)];
    }

    return conditions;
  }

  private quantityOrder(reqDto: GetStockRankingReqDto): SQL {
    return reqDto.order === StockRankingOrder.LOWEST
      ? asc(inventoryBalances.quantity)
      : desc(inventoryBalances.quantity);
  }
}
