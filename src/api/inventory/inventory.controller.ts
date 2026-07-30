import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetInventoryReqDto } from './dto/get-inventory.req.dto';
import { GetMaterialInventoryReqDto } from './dto/get-material-inventory.req.dto';
import { InventoryItemResDto } from './dto/inventory-item.res.dto';
import { MaterialInventoryItemResDto } from './dto/material-inventory-item.res.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryItemResDto,
    summary: 'List finished-goods stock levels (onHand/reserved/available)',
    isPaginated: true,
  })
  getInventory(
    @Query() reqDto: GetInventoryReqDto,
  ): Promise<OffsetPaginatedDto<InventoryItemResDto>> {
    return this.inventoryService.getInventory(reqDto);
  }

  @Get('materials')
  @Permissions('inventory:read')
  @ApiAuth({
    type: MaterialInventoryItemResDto,
    summary:
      'List material stock levels (onHand/reserved/issuable/bomDemand/available/status)',
    isPaginated: true,
  })
  getMaterialInventory(
    @Query() reqDto: GetMaterialInventoryReqDto,
  ): Promise<OffsetPaginatedDto<MaterialInventoryItemResDto>> {
    return this.inventoryService.getMaterialInventory(reqDto);
  }
}
