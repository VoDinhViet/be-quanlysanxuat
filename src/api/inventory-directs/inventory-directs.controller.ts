import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetInventoryDirectsReqDto } from './dto/get-inventory-directs.req.dto';
import { InventoryDirectResDto } from './dto/inventory-direct.res.dto';
import { InventoryDirectsService } from './inventory-directs.service';

@ApiTags('Inventory Directs')
@Controller('inventory-directs')
export class InventoryDirectsController {
  constructor(
    private readonly inventoryDirectsService: InventoryDirectsService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryDirectResDto,
    summary: 'Tồn kho vật tư (onHand/reserved/bomDemand/available/status)',
    isPaginated: true,
  })
  getInventoryDirects(
    @Query() reqDto: GetInventoryDirectsReqDto,
  ): Promise<OffsetPaginatedDto<InventoryDirectResDto>> {
    return this.inventoryDirectsService.getInventoryDirects(reqDto);
  }
}
