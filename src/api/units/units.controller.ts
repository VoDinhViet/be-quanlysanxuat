import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

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
    isArray: true,
  })
  getUnits(@Query() reqDto: GetUnitsReqDto): Promise<UnitResDto[]> {
    return this.unitsService.getUnits(reqDto);
  }
}
