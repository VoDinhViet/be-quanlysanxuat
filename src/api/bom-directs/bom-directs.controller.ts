import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { BomDirectsService } from './bom-directs.service';
import { BomDirectResDto } from './dto/bom-direct.res.dto';
import { GetBomDirectsReqDto } from './dto/get-bom-directs.req.dto';

@ApiTags('Boms')
@Controller('items/:itemId/bom/items/:bomItemId/directs')
export class BomDirectsController {
  constructor(private readonly bomDirectsService: BomDirectsService) {}

  @Get()
  @Permissions('items:read')
  @ApiAuth({
    type: BomDirectResDto,
    summary: "List one BOM node's own directly-attached vật tư (DIRECT)",
    isPaginated: true,
  })
  getDirects(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('bomItemId') bomItemId: string,
    @Query() reqDto: GetBomDirectsReqDto,
  ): Promise<OffsetPaginatedDto<BomDirectResDto>> {
    return this.bomDirectsService.getBomDirects(itemId, bomItemId, reqDto);
  }
}
