import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateItemReqDto } from './dto/create-item.req.dto';
import { GetItemMaterialsReqDto } from './dto/get-item-materials.req.dto';
import { GetItemOptionsReqDto } from './dto/get-item-options.req.dto';
import { GetItemsReqDto } from './dto/get-items.req.dto';
import { ItemDetailResDto } from './dto/item-detail.res.dto';
import { ItemMaterialResDto } from './dto/item-material.res.dto';
import { ItemOptionResDto } from './dto/item-option.res.dto';
import { ItemResDto } from './dto/item.res.dto';
import { UpdateItemReqDto } from './dto/update-item.req.dto';
import { ItemsService } from './items.service';

@ApiTags('Items')
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  @Permissions('items:read')
  @ApiAuth({
    type: ItemResDto,
    summary: 'List items (FG/WIP/RM)',
    isPaginated: true,
  })
  getItems(
    @Query() reqDto: GetItemsReqDto,
  ): Promise<OffsetPaginatedDto<ItemResDto>> {
    return this.itemsService.getItems(reqDto);
  }

  @Get('options')
  @Permissions('items:read')
  @ApiAuth({
    type: ItemOptionResDto,
    summary: 'List items for dropdown (max 100, ACTIVE only)',
    isArray: true,
  })
  getItemOptions(
    @Query() reqDto: GetItemOptionsReqDto,
  ): Promise<ItemOptionResDto[]> {
    return this.itemsService.getItemOptions(reqDto);
  }

  @Get(':itemId')
  @Permissions('items:read')
  @ApiAuth({
    type: ItemDetailResDto,
    summary: 'Get item detail',
  })
  getItemDetail(
    @UUIDParam('itemId') itemId: string,
  ): Promise<ItemDetailResDto> {
    return this.itemsService.getItemDetail(itemId);
  }

  @Post()
  @Permissions('items:create')
  @ApiAuth({
    summary: 'Create item',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createItem(
    @Body() reqDto: CreateItemReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.itemsService.createItem(reqDto, payload.userId);
  }

  @Patch(':itemId')
  @Permissions('items:update')
  @ApiAuth({
    summary: 'Update item',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateItem(
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: UpdateItemReqDto,
  ): Promise<void> {
    return this.itemsService.updateItem(itemId, reqDto);
  }

  @Get(':itemId/materials')
  @Permissions('items:read')
  @ApiAuth({
    type: ItemMaterialResDto,
    summary: "Get an item's BOM materials list (Thành phần vật tư)",
    isPaginated: true,
  })
  getItemMaterials(
    @UUIDParam('itemId') itemId: string,
    @Query() reqDto: GetItemMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<ItemMaterialResDto>> {
    return this.itemsService.getItemMaterials(itemId, reqDto);
  }

  @Post(':itemId/copy')
  @Permissions('items:copy')
  @ApiAuth({
    summary:
      'Copy (clone) an FG/WIP item, including its BOM tree and routing (Nhân bản)',
    statusCode: HttpStatus.CREATED,
  })
  copyItem(
    @UUIDParam('itemId') itemId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.itemsService.copyItem(itemId, payload.userId);
  }
}
