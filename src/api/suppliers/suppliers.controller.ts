import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateSupplierReqDto } from './dto/create-supplier.req.dto';
import { GetSuppliersReqDto } from './dto/get-suppliers.req.dto';
import { SupplierResDto } from './dto/supplier.res.dto';
import { UpdateSupplierReqDto } from './dto/update-supplier.req.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Permissions('suppliers:read')
  @ApiAuth({
    type: SupplierResDto,
    summary: 'List suppliers',
    isPaginated: true,
  })
  getSuppliers(@Query() reqDto: GetSuppliersReqDto): Promise<OffsetPaginatedDto<SupplierResDto>> {
    return this.suppliersService.getSuppliers(reqDto);
  }

  @Post()
  @Permissions('suppliers:create')
  @ApiAuth({
    type: SupplierResDto,
    summary: 'Create supplier',
    statusCode: HttpStatus.CREATED,
  })
  createSupplier(@Body() reqDto: CreateSupplierReqDto): Promise<SupplierResDto> {
    return this.suppliersService.createSupplier(reqDto);
  }

  @Patch(':supplierId')
  @Permissions('suppliers:update')
  @ApiAuth({
    type: SupplierResDto,
    summary: 'Update supplier',
  })
  updateSupplier(
    @UUIDParam('supplierId') supplierId: string,
    @Body() reqDto: UpdateSupplierReqDto,
  ): Promise<SupplierResDto> {
    return this.suppliersService.updateSupplier(supplierId, reqDto);
  }

  @Delete(':supplierId')
  @Permissions('suppliers:delete')
  @ApiAuth({
    type: SupplierResDto,
    summary: 'Delete supplier',
  })
  deleteSupplier(@UUIDParam('supplierId') supplierId: string): Promise<SupplierResDto> {
    return this.suppliersService.deleteSupplier(supplierId);
  }
}
