import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import {
  inventoryBalances,
  inventoryReceipts,
  items,
} from '../../database/schemas';

import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  InventorySortOrder,
  InventorySummaryReqDto,
  InventoryView,
} from './dto/integration-inventory.req.dto';
import {
  dateRangeConditions,
  IntegrationQueryService,
} from './integration-query.service';

const DEFAULT_RANKING_LIMIT = 10;

@Injectable()
export class IntegrationInventoryService {
  constructor(private readonly queryService: IntegrationQueryService) {}

  summarizeInventory(
    reqDto: InventorySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    switch (reqDto.view) {
      case InventoryView.STOCK_RANKING:
        return this.rankStock(reqDto);
      case InventoryView.BELOW_MIN:
        return this.listBelowMinStock(reqDto);
      case InventoryView.RECEIPTS_BY_STATUS:
        return this.countReceiptsByStatus(reqDto);
    }
  }

  private rankStock(
    reqDto: InventorySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    // Xếp thấp nhất mà không loại dòng hết hàng thì toàn dòng tồn bằng 0, vô nghĩa: chỉ lấy còn hàng
    const isInStockOnly =
      !!reqDto.inStockOnly || reqDto.order === InventorySortOrder.LOWEST;
    return this.queryService.query(
      'inventory_summary',
      ['code', 'name', 'quantity'],
      (tx) =>
        tx
          .select({
            code: items.code,
            name: items.name,
            quantity: sql<number>`${inventoryBalances.quantity}::float8`,
          })
          .from(inventoryBalances)
          .innerJoin(items, eq(items.id, inventoryBalances.itemId))
          .where(
            and(
              isNull(items.deletedAt),
              isInStockOnly ? gt(inventoryBalances.quantity, 0) : undefined,
            ),
          )
          .orderBy(this.orderByQuantity(reqDto), asc(items.code))
          .limit(reqDto.limit ?? DEFAULT_RANKING_LIMIT),
    );
  }

  private listBelowMinStock(
    reqDto: InventorySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'inventory_summary',
      ['code', 'name', 'quantity', 'ton_toi_thieu'],
      (tx) =>
        tx
          .select({
            code: items.code,
            name: items.name,
            quantity: sql<number>`${inventoryBalances.quantity}::float8`,
            ton_toi_thieu: sql<number>`${items.minStock}::float8`,
          })
          .from(inventoryBalances)
          .innerJoin(items, eq(items.id, inventoryBalances.itemId))
          .where(
            and(
              isNull(items.deletedAt),
              gt(items.minStock, 0),
              lt(inventoryBalances.quantity, items.minStock),
            ),
          )
          .orderBy(this.orderByQuantity(reqDto), asc(items.code))
          .limit(reqDto.limit ?? DEFAULT_RANKING_LIMIT),
    );
  }

  private countReceiptsByStatus(
    reqDto: InventorySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const receiptType = sql<string>`${inventoryReceipts.receiptType}::text`;
    const status = sql<string>`${inventoryReceipts.status}::text`;
    return this.queryService.query(
      'inventory_summary',
      ['receipt_type', 'status', 'so_phieu'],
      (tx) =>
        tx
          .select({
            receipt_type: receiptType,
            status,
            so_phieu: sql<number>`count(*)::int`,
          })
          .from(inventoryReceipts)
          .where(
            and(
              ...dateRangeConditions(
                sql`${inventoryReceipts.receiptDate}`,
                reqDto,
              ),
            ),
          )
          .groupBy(inventoryReceipts.receiptType, inventoryReceipts.status)
          .orderBy(asc(receiptType), asc(status)),
    );
  }

  private orderByQuantity(reqDto: InventorySummaryReqDto): SQL {
    return reqDto.order === InventorySortOrder.LOWEST
      ? asc(inventoryBalances.quantity)
      : desc(inventoryBalances.quantity);
  }
}
