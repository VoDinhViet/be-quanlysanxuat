import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateItemUnitReqDto } from './dto/create-item-unit.req.dto';
import { ItemUnitResDto } from './dto/item-unit.res.dto';
import { UpdateItemUnitReqDto } from './dto/update-item-unit.req.dto';
import { ItemUnitsService } from './item-units.service';

@ApiTags('Items')
@Controller('items/:itemId/units')
export class ItemUnitsController {
  constructor(private readonly itemUnitsService: ItemUnitsService) {}

  @Get()
  @Permissions('items:read')
  @ApiAuth({
    type: ItemUnitResDto,
    summary: "List an item's secondary units and their conversion factors",
    isArray: true,
  })
  getItemUnits(@UUIDParam('itemId') itemId: string): Promise<ItemUnitResDto[]> {
    return this.itemUnitsService.getItemUnits(itemId);
  }

  @Post()
  @Permissions('items:update')
  @ApiAuth({
    summary: 'Add a secondary unit + conversion factor for this item',
    statusCode: HttpStatus.CREATED,
  })
  createItemUnit(
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: CreateItemUnitReqDto,
  ): Promise<void> {
    return this.itemUnitsService.createItemUnit(itemId, reqDto);
  }

  @Patch(':unitId')
  @Permissions('items:update')
  @ApiAuth({
    summary: 'Update the conversion factor of a secondary unit',
  })
  updateItemUnit(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('unitId') unitId: string,
    @Body() reqDto: UpdateItemUnitReqDto,
  ): Promise<void> {
    return this.itemUnitsService.updateItemUnit(itemId, unitId, reqDto);
  }

  @Delete(':unitId')
  @Permissions('items:update')
  @ApiAuth({
    summary: 'Remove a secondary unit from this item',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteItemUnit(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('unitId') unitId: string,
  ): Promise<void> {
    return this.itemUnitsService.deleteItemUnit(itemId, unitId);
  }
}
