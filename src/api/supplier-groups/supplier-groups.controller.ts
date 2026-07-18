import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiPublic } from '../../decorators/http.decorators';
import { GetSupplierGroupsReqDto } from './dto/get-supplier-groups.req.dto';
import { SupplierGroupResDto } from './dto/supplier-group.res.dto';
import { SupplierGroupsService } from './supplier-groups.service';

@ApiTags('Supplier Groups')
@Controller('supplier-groups')
export class SupplierGroupsController {
  constructor(private readonly supplierGroupsService: SupplierGroupsService) {}

  @Get()
  @ApiPublic({
    type: SupplierGroupResDto,
    summary: 'List supplier groups',
    isPaginated: true,
  })
  getSupplierGroups(
    @Query() reqDto: GetSupplierGroupsReqDto,
  ): Promise<OffsetPaginatedDto<SupplierGroupResDto>> {
    return this.supplierGroupsService.getSupplierGroups(reqDto);
  }
}
