import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateUnitReqDto } from './dto/create-unit.req.dto';
import { GetUnitsReqDto } from './dto/get-units.req.dto';
import { UnitResDto } from './dto/unit.res.dto';
import { UpdateUnitReqDto } from './dto/update-unit.req.dto';
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

  @Get(':unitId')
  @ApiPublic({
    type: UnitResDto,
    summary: 'Get unit detail',
  })
  getUnit(@UUIDParam('unitId') unitId: string): Promise<UnitResDto> {
    return this.unitsService.getUnit(unitId);
  }

  @Post()
  @Permissions('items:create')
  @ApiAuth({
    summary: 'Create a unit',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createUnit(@Body() reqDto: CreateUnitReqDto): Promise<void> {
    return this.unitsService.createUnit(reqDto);
  }

  @Patch(':unitId')
  @Permissions('items:update')
  @ApiAuth({
    summary: 'Update a unit',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateUnit(
    @UUIDParam('unitId') unitId: string,
    @Body() reqDto: UpdateUnitReqDto,
  ): Promise<void> {
    return this.unitsService.updateUnit(unitId, reqDto);
  }

  @Delete(':unitId')
  @Permissions('items:update')
  @ApiAuth({
    summary:
      'Delete a unit (hard delete; blocked if it has any item/production job snapshot)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteUnit(@UUIDParam('unitId') unitId: string): Promise<void> {
    return this.unitsService.deleteUnit(unitId);
  }
}
