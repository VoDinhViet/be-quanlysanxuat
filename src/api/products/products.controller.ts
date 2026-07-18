import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductResDto } from './dto/product.res.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions('products:read')
  @ApiPublic({
    type: ProductResDto,
    summary: 'List products',
    isPaginated: true,
  })
  getProducts(@Query() reqDto: GetProductsReqDto): Promise<OffsetPaginatedDto<ProductResDto>> {
    return this.productsService.getProducts(reqDto);
  }

  @Get(':id')
  @Permissions('products:read')
  @ApiPublic({
    type: ProductResDto,
    summary: 'Get product detail',
  })
  getProductDetail(@UUIDParam('id') id: string): Promise<ProductResDto> {
    return this.productsService.getProductDetail(id);
  }

  @Post()
  @Permissions('products:create')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Create product',
    statusCode: HttpStatus.CREATED,
  })
  createProduct(
    @Body() reqDto: CreateProductReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductResDto> {
    return this.productsService.createProduct(reqDto, payload.sub);
  }

  @Patch(':id')
  @Permissions('products:update')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Update product',
  })
  updateProduct(
    @UUIDParam('id') id: string,
    @Body() reqDto: UpdateProductReqDto,
  ): Promise<ProductResDto> {
    return this.productsService.updateProduct(id, reqDto);
  }

  @Delete(':id')
  @Permissions('products:delete')
  @ApiAuth({
    summary: 'Delete product (soft delete)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteProduct(@UUIDParam('id') id: string): Promise<void> {
    return this.productsService.deleteProduct(id);
  }

  @Post(':id/copy')
  @Permissions('products:copy')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Copy (duplicate) a product',
    statusCode: HttpStatus.CREATED,
  })
  copyProduct(
    @UUIDParam('id') id: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductResDto> {
    return this.productsService.copyProduct(id, payload.sub);
  }
}
