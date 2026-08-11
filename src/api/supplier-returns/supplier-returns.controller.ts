import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetSupplierReturnsReqDto } from './dto/get-supplier-returns.req.dto';
import { PageSupplierReturnResDto } from './dto/page-supplier-return.res.dto';
import { SupplierReturnsService } from './supplier-returns.service';

@ApiTags('Supplier Returns')
@Controller('supplier-returns')
export class SupplierReturnsController {
  constructor(
    private readonly supplierReturnsService: SupplierReturnsService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: PageSupplierReturnResDto,
    summary: 'List phiếu trả NCC',
    isPaginated: true,
  })
  getSupplierReturns(
    @Query() reqDto: GetSupplierReturnsReqDto,
  ): Promise<OffsetPaginatedDto<PageSupplierReturnResDto>> {
    return this.supplierReturnsService.getSupplierReturns(reqDto);
  }
}
