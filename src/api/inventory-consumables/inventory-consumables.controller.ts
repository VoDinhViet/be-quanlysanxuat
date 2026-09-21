import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetInventoryConsumablesReqDto } from './dto/get-inventory-consumables.req.dto';
import { InventoryConsumableResDto } from './dto/inventory-consumable.res.dto';
import { InventoryConsumablesService } from './inventory-consumables.service';

@ApiTags('Inventory Consumables')
@Controller('inventory-consumables')
export class InventoryConsumablesController {
  constructor(
    private readonly inventoryConsumablesService: InventoryConsumablesService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryConsumableResDto,
    summary: 'Tồn kho vật tư (onHand/reserved/bomDemand/available/status)',
    isPaginated: true,
  })
  getInventoryConsumables(
    @Query() reqDto: GetInventoryConsumablesReqDto,
  ): Promise<OffsetPaginatedDto<InventoryConsumableResDto>> {
    return this.inventoryConsumablesService.getInventoryConsumables(reqDto);
  }
}
