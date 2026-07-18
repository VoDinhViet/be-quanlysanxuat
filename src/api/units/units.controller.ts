import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiPublic } from '../../decorators/http.decorators';
import { GetUnitsReqDto } from './dto/get-units.req.dto';
import { UnitResDto } from './dto/unit.res.dto';
import { UnitsService } from './units.service';

@ApiTags('Units')
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiPublic({
    type: UnitResDto,
    summary: 'List units',
    isPaginated: true,
  })
  getUnits(@Query() reqDto: GetUnitsReqDto): Promise<OffsetPaginatedDto<UnitResDto>> {
    return this.unitsService.getUnits(reqDto);
  }
}
