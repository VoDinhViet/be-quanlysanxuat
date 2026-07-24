import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiPublic } from '../../decorators/http.decorators';
import { GetPositionsReqDto } from './dto/get-positions.req.dto';
import { PositionResDto } from './dto/position.res.dto';
import { PositionsService } from './positions.service';

@ApiTags('Positions')
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @ApiPublic({
    type: PositionResDto,
    summary: 'List positions',
    isPaginated: true,
  })
  getPositions(
    @Query() reqDto: GetPositionsReqDto,
  ): Promise<OffsetPaginatedDto<PositionResDto>> {
    return this.positionsService.getPositions(reqDto);
  }
}
