import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { BomConsumablesService } from './bom-consumables.service';
import { BomConsumableResDto } from './dto/bom-consumable.res.dto';
import { GetBomConsumablesReqDto } from './dto/get-bom-consumables.req.dto';

@ApiTags('Boms')
@Controller('items/:itemId/bom/items/:bomItemId/consumables')
export class BomConsumablesController {
  constructor(private readonly bomConsumablesService: BomConsumablesService) {}

  @Get()
  @Permissions('items:read')
  @ApiAuth({
    type: BomConsumableResDto,
    summary: "List one BOM node's own directly-attached vật tư (CONSUMABLE)",
    isPaginated: true,
  })
  getConsumables(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('bomItemId') bomItemId: string,
    @Query() reqDto: GetBomConsumablesReqDto,
  ): Promise<OffsetPaginatedDto<BomConsumableResDto>> {
    return this.bomConsumablesService.getBomConsumables(
      itemId,
      bomItemId,
      reqDto,
    );
  }
}
