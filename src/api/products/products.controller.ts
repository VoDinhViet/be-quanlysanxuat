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

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductDetailResDto } from './dto/product-detail.res.dto';
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
  getProducts(
    @Query() reqDto: GetProductsReqDto,
  ): Promise<OffsetPaginatedDto<ProductResDto>> {
    return this.productsService.getProducts(reqDto);
  }

  @Get(':productId')
  @Permissions('products:read')
  @ApiPublic({
    type: ProductDetailResDto,
    summary: 'Get product detail',
  })
  getProductDetail(
    @UUIDParam('productId') productId: string,
  ): Promise<ProductDetailResDto> {
    return this.productsService.getProductDetail(productId);
  }

  @Post()
  @Permissions('products:create')
  @ApiAuth({
    type: ProductDetailResDto,
    summary: 'Create product',
    statusCode: HttpStatus.CREATED,
  })
  createProduct(
    @Body() reqDto: CreateProductReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductDetailResDto> {
    return this.productsService.createProduct(reqDto, payload.sub);
  }

  @Patch(':productId')
  @Permissions('products:update')
  @ApiAuth({
    type: ProductDetailResDto,
    summary: 'Update product',
  })
  updateProduct(
    @UUIDParam('productId') productId: string,
    @Body() reqDto: UpdateProductReqDto,
  ): Promise<ProductDetailResDto> {
    return this.productsService.updateProduct(productId, reqDto);
  }

  @Delete(':productId')
  @Permissions('products:delete')
  @ApiAuth({
    summary: 'Delete product (soft delete)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteProduct(@UUIDParam('productId') productId: string): Promise<void> {
    return this.productsService.deleteProduct(productId);
  }

  @Post(':productId/copy')
  @Permissions('products:copy')
  @ApiAuth({
    type: ProductDetailResDto,
    summary:
      'Copy (clone) a product, including its BOM tree and routing (Nhân bản)',
    statusCode: HttpStatus.CREATED,
  })
  copyProduct(
    @UUIDParam('productId') productId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductDetailResDto> {
    return this.productsService.copyProduct(productId, payload.sub);
  }
}
