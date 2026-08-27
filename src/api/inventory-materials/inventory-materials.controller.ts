import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetInventoryMaterialsReqDto } from './dto/get-inventory-materials.req.dto';
import { InventoryMaterialResDto } from './dto/inventory-material.res.dto';
import { InventoryMaterialsService } from './inventory-materials.service';

@ApiTags('Inventory Materials')
@Controller('inventory-materials')
export class InventoryMaterialsController {
  constructor(
    private readonly inventoryMaterialsService: InventoryMaterialsService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryMaterialResDto,
    summary: 'Tồn kho vật tư (onHand/reserved/bomDemand/available/status)',
    isPaginated: true,
  })
  getInventoryMaterials(
    @Query() reqDto: GetInventoryMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<InventoryMaterialResDto>> {
    return this.inventoryMaterialsService.getInventoryMaterials(reqDto);
  }
}
