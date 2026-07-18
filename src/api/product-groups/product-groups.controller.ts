import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiPublic } from '../../decorators/http.decorators';
import { GetProductGroupsReqDto } from './dto/get-product-groups.req.dto';
import { ProductGroupResDto } from './dto/product-group.res.dto';
import { ProductGroupsService } from './product-groups.service';

@ApiTags('Product Groups')
@Controller('product-groups')
export class ProductGroupsController {
  constructor(private readonly productGroupsService: ProductGroupsService) {}

  @Get()
  @ApiPublic({
    type: ProductGroupResDto,
    summary: 'List product groups',
    isPaginated: true,
  })
  getProductGroups(
    @Query() reqDto: GetProductGroupsReqDto,
  ): Promise<OffsetPaginatedDto<ProductGroupResDto>> {
    return this.productGroupsService.getProductGroups(reqDto);
  }
}
