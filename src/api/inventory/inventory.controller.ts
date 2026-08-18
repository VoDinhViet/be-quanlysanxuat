import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetInventoryBalancesReqDto } from './dto/get-inventory-balances.req.dto';
import { GetInventoryReqDto } from './dto/get-inventory.req.dto';
import { GetInventoryTransactionsReqDto } from './dto/get-inventory-transactions.req.dto';
import { InventoryBalanceResDto } from './dto/inventory-balance.res.dto';
import { InventoryItemResDto } from './dto/inventory-item.res.dto';
import { InventoryTransactionResDto } from './dto/inventory-transaction.res.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryItemResDto,
    summary:
      'List stock levels (onHand/reserved/bomDemand/available/status) — filter theo itemType, bỏ trống = FG/RM (kho không quản tồn WIP)',
    isPaginated: true,
  })
  getInventory(
    @Query() reqDto: GetInventoryReqDto,
  ): Promise<OffsetPaginatedDto<InventoryItemResDto>> {
    return this.inventoryService.getInventory(reqDto);
  }

  @Get('balances')
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryBalanceResDto,
    summary: 'Tồn thô theo (kho × mặt hàng) — đọc thẳng inventory_balances',
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
}
