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

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateWarehouseReqDto } from './dto/create-warehouse.req.dto';
import { GetWarehousesReqDto } from './dto/get-warehouses.req.dto';
import { PageWarehouseResDto } from './dto/page-warehouse.res.dto';
import { UpdateWarehouseReqDto } from './dto/update-warehouse.req.dto';
import { WarehouseResDto } from './dto/warehouse.res.dto';
import { WarehousesService } from './warehouses.service';

@ApiTags('Warehouses')
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: PageWarehouseResDto,
    summary: 'List warehouses (danh mục kho)',
    isPaginated: true,
  })
  getWarehouses(
    @Query() reqDto: GetWarehousesReqDto,
  ): Promise<OffsetPaginatedDto<PageWarehouseResDto>> {
    return this.warehousesService.getWarehouses(reqDto);
  }

  @Get('options')
  @Permissions('inventory:read')
  @ApiAuth({
    type: WarehouseResDto,
    summary: 'List warehouses for dropdown (max 100, ACTIVE only)',
    isArray: true,
  })
  getWarehouseOptions(): Promise<WarehouseResDto[]> {
    return this.warehousesService.getWarehouseOptions();
  }

  @Get(':warehouseId')
  @Permissions('inventory:read')
  @ApiAuth({
    type: WarehouseResDto,
    summary: 'Get warehouse detail',
  })
  getWarehouse(
    @UUIDParam('warehouseId') warehouseId: string,
  ): Promise<WarehouseResDto> {
    return this.warehousesService.getWarehouse(warehouseId);
  }

  @Post()
  @Permissions('inventory:create')
  @ApiAuth({
    type: WarehouseResDto,
    summary: 'Create a warehouse',
    statusCode: HttpStatus.CREATED,
  })
  createWarehouse(
    @Body() reqDto: CreateWarehouseReqDto,
  ): Promise<WarehouseResDto> {
    return this.warehousesService.createWarehouse(reqDto);
  }

  @Patch(':warehouseId')
  @Permissions('inventory:update')
  @ApiAuth({
    type: WarehouseResDto,
    summary: 'Update a warehouse',
  })
  updateWarehouse(
    @UUIDParam('warehouseId') warehouseId: string,
    @Body() reqDto: UpdateWarehouseReqDto,
  ): Promise<WarehouseResDto> {
    return this.warehousesService.updateWarehouse(warehouseId, reqDto);
  }

  @Delete(':warehouseId')
  @Permissions('inventory:delete')
  @ApiAuth({
    summary:
      'Delete a warehouse (hard delete; blocked if it has any receipt/issue/balance)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteWarehouse(
    @UUIDParam('warehouseId') warehouseId: string,
  ): Promise<void> {
    return this.warehousesService.deleteWarehouse(warehouseId);
  }
}
