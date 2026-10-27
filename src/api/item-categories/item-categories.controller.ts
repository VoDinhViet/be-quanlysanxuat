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
import { CreateItemCategoryReqDto } from './dto/create-item-category.req.dto';
import { GetItemCategoriesReqDto } from './dto/get-item-categories.req.dto';
import { ItemCategoryResDto } from './dto/item-category.res.dto';
import { UpdateItemCategoryReqDto } from './dto/update-item-category.req.dto';
import { ItemCategoriesService } from './item-categories.service';

@ApiTags('Item categories')
@Controller('item-categories')
export class ItemCategoriesController {
  constructor(private readonly itemCategoriesService: ItemCategoriesService) {}

  @Get()
  @ApiPublic({
    type: ItemCategoryResDto,
    summary: 'List item categories (nhóm vật tư)',
    isArray: true,
  })
  getItemCategories(
    @Query() reqDto: GetItemCategoriesReqDto,
  ): Promise<ItemCategoryResDto[]> {
    return this.itemCategoriesService.getItemCategories(reqDto);
  }

  @Get(':itemCategoryId')
  @ApiPublic({
    type: ItemCategoryResDto,
    summary: 'Get item category detail',
  })
  getItemCategory(
    @UUIDParam('itemCategoryId') itemCategoryId: string,
  ): Promise<ItemCategoryResDto> {
    return this.itemCategoriesService.getItemCategory(itemCategoryId);
  }

  @Post()
  @Permissions('items:create')
  @ApiAuth({
    summary: 'Create an item category',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createItemCategory(@Body() reqDto: CreateItemCategoryReqDto): Promise<void> {
    return this.itemCategoriesService.createItemCategory(reqDto);
  }

  @Patch(':itemCategoryId')
  @Permissions('items:update')
  @ApiAuth({
    summary: 'Update an item category',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateItemCategory(
    @UUIDParam('itemCategoryId') itemCategoryId: string,
    @Body() reqDto: UpdateItemCategoryReqDto,
  ): Promise<void> {
    return this.itemCategoriesService.updateItemCategory(
      itemCategoryId,
      reqDto,
    );
  }

  @Delete(':itemCategoryId')
  @Permissions('items:update')
  @ApiAuth({
    summary:
      'Delete an item category (hard delete; blocked if any item uses it)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteItemCategory(
    @UUIDParam('itemCategoryId') itemCategoryId: string,
  ): Promise<void> {
    return this.itemCategoriesService.deleteItemCategory(itemCategoryId);
  }
}
