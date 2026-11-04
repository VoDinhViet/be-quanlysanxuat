import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetInventoryBalancesReqDto } from './dto/get-inventory-balances.req.dto';
import { GetInventoryTransactionsReqDto } from './dto/get-inventory-transactions.req.dto';
import { GetStockRankingReqDto } from './dto/get-stock-ranking.req.dto';
import { InventoryBalanceResDto } from './dto/inventory-balance.res.dto';
import { InventoryTransactionResDto } from './dto/inventory-transaction.res.dto';
import { StockRankingResDto } from './dto/stock-ranking.res.dto';
import { InventorySummaryService } from './inventory-summary.service';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly inventorySummaryService: InventorySummaryService,
  ) {}

  @Get('balances')
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryBalanceResDto,
    summary:
      'Tồn thô theo (kho × mặt hàng) — reservedQuantity tính động lúc đọc, không phải cột lưu sẵn',
    isPaginated: true,
  })
  getInventoryBalances(
    @Query() reqDto: GetInventoryBalancesReqDto,
  ): Promise<OffsetPaginatedDto<InventoryBalanceResDto>> {
    return this.inventoryService.getInventoryBalances(reqDto);
  }

  @Get('transactions')
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryTransactionResDto,
    summary: 'Sổ cái kho — đọc thẳng inventory_transactions',
    isPaginated: true,
  })
  getInventoryTransactions(
    @Query() reqDto: GetInventoryTransactionsReqDto,
  ): Promise<OffsetPaginatedDto<InventoryTransactionResDto>> {
    return this.inventoryService.getInventoryTransactions(reqDto);
  }

  @Get('stock-ranking')
  @Permissions('inventory:read')
  @ApiAuth({
    type: StockRankingResDto,
    isArray: true,
    summary:
      'Items ranked by stock quantity (highest, lowest, or below minimum stock)',
  })
  getStockRanking(
    @Query() reqDto: GetStockRankingReqDto,
  ): Promise<StockRankingResDto[]> {
    return this.inventorySummaryService.getStockRanking(reqDto);
  }
}
