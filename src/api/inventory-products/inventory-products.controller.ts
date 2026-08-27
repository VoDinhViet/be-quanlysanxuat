import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetInventoryProductsReqDto } from './dto/get-inventory-products.req.dto';
import { GetProductLedgerReqDto } from './dto/get-product-ledger.req.dto';
import { InventoryProductResDto } from './dto/inventory-product.res.dto';
import { ProductLedgerEntryResDto } from './dto/product-ledger-entry.res.dto';
import { InventoryProductsService } from './inventory-products.service';

@ApiTags('Inventory Products')
@Controller('inventory-products')
export class InventoryProductsController {
  constructor(
    private readonly inventoryProductsService: InventoryProductsService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryProductResDto,
    summary: 'Tồn kho thành phẩm (onHand/reserved/bomDemand/available/status)',
    isPaginated: true,
  })
  getInventoryProducts(
    @Query() reqDto: GetInventoryProductsReqDto,
  ): Promise<OffsetPaginatedDto<InventoryProductResDto>> {
    return this.inventoryProductsService.getInventoryProducts(reqDto);
  }

  @Get(':itemId/ledger')
  @Permissions('inventory:read')
  @ApiAuth({
    type: ProductLedgerEntryResDto,
    summary:
      'Sổ cái (thẻ kho) của một thành phẩm — lịch sử giao dịch kèm tồn luỹ kế sau từng giao dịch',
    isPaginated: true,
  })
  getProductLedger(
    @UUIDParam('itemId') itemId: string,
    @Query() reqDto: GetProductLedgerReqDto,
  ): Promise<OffsetPaginatedDto<ProductLedgerEntryResDto>> {
    return this.inventoryProductsService.getProductLedger(itemId, reqDto);
  }
}
