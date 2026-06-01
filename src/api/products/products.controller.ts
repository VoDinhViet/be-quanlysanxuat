import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductOptionResDto } from './dto/product-option.res.dto';
import { ProductResDto } from './dto/product.res.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions('products:read')
  @ApiAuth({
    type: ProductResDto,
    summary: 'List products',
    isPaginated: true,
  })
  getProducts(@Query() reqDto: GetProductsReqDto): Promise<OffsetPaginatedDto<ProductResDto>> {
    return this.productsService.getProducts(reqDto);
  }

  @Get('options')
  @Permissions('products:read')
  @ApiAuth({
    type: ProductOptionResDto,
    summary: 'List product options',
    isArray: true,
  })
  getProductOptions(): Promise<ProductOptionResDto[]> {
    return this.productsService.getProductOptions();
  }

  @Get('units/options')
  @Permissions('products:read')
  @ApiAuth({
    type: ProductOptionResDto,
    summary: 'List unit options',
    isArray: true,
  })
  getUnitOptions(): Promise<ProductOptionResDto[]> {
    return this.productsService.getUnitOptions();
  }

  @Get('types/options')
  @Permissions('products:read')
  @ApiAuth({
    type: ProductOptionResDto,
    summary: 'List product type options',
    isArray: true,
  })
  getProductTypeOptions(): Promise<ProductOptionResDto[]> {
    return this.productsService.getProductTypeOptions();
  }

  @Get('operations/options')
  @Permissions('products:read')
  @ApiAuth({
    type: ProductOptionResDto,
    summary: 'List operation options',
    isArray: true,
  })
  getOperationOptions(): Promise<ProductOptionResDto[]> {
    return this.productsService.getOperationOptions();
  }

  @Get(':productId')
  @Permissions('products:read')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Get product detail',
  })
  getProductDetail(@UUIDParam('productId') productId: string): Promise<ProductResDto> {
    return this.productsService.getProductDetail(productId);
  }

  @Post()
  @Permissions('products:create')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Create product',
    statusCode: HttpStatus.CREATED,
  })
  createProduct(@Body() reqDto: CreateProductReqDto): Promise<ProductResDto> {
    return this.productsService.createProduct(reqDto);
  }

  @Patch(':productId')
  @Permissions('products:update')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Update product',
  })
  updateProduct(
    @UUIDParam('productId') productId: string,
    @Body() reqDto: UpdateProductReqDto,
  ): Promise<ProductResDto> {
    return this.productsService.updateProduct(productId, reqDto);
  }

  @Delete(':productId')
  @Permissions('products:delete')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Delete product',
  })
  deleteProduct(@UUIDParam('productId') productId: string): Promise<ProductResDto> {
    return this.productsService.deleteProduct(productId);
  }
}
