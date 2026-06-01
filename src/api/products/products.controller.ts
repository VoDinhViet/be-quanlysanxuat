import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { User } from '../../decorators/user.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import {
  MAX_PRODUCT_IMAGE_SIZE_IN_BYTES,
  PRODUCT_IMAGE_FIELD_NAME,
  PRODUCT_IMAGE_UPLOAD_DIR,
} from './constants/product-image.constants';
import { BomLineResDto } from './dto/bom-line.res.dto';
import { BomTreeNodeResDto } from './dto/bom-tree-node.res.dto';
import { CreateBomLineReqDto } from './dto/create-bom-line.req.dto';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { CreateProductRevisionReqDto } from './dto/create-product-revision.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductOptionResDto } from './dto/product-option.res.dto';
import { ProductRevisionResDto } from './dto/product-revision.res.dto';
import { ProductResDto } from './dto/product.res.dto';
import { RoutingStepResDto } from './dto/routing-step.res.dto';
import { UpdateBomLineReqDto } from './dto/update-bom-line.req.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';
import { UpdateProductRevisionReqDto } from './dto/update-product-revision.req.dto';
import { UpdateRoutingReqDto } from './dto/update-routing.req.dto';
import { ProductsService } from './products.service';
import type { ProductImageFile } from './types/product-image-file.type';

const PRODUCT_IMAGE_MULTER_OPTIONS: MulterOptions = {
  dest: PRODUCT_IMAGE_UPLOAD_DIR,
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_SIZE_IN_BYTES,
    files: 1,
  },
};

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

  @Get(':productId/revisions')
  @Permissions('products:read')
  @ApiAuth({
    type: ProductRevisionResDto,
    summary: 'List product revisions',
    isArray: true,
  })
  getProductRevisions(@UUIDParam('productId') productId: string): Promise<ProductRevisionResDto[]> {
    return this.productsService.getProductRevisions(productId);
  }

  @Post(':productId/revisions')
  @Permissions('products:update')
  @ApiAuth({
    type: ProductRevisionResDto,
    summary: 'Create product revision',
    statusCode: HttpStatus.CREATED,
  })
  createProductRevision(
    @UUIDParam('productId') productId: string,
    @Body() reqDto: CreateProductRevisionReqDto,
  ): Promise<ProductRevisionResDto> {
    return this.productsService.createProductRevision(productId, reqDto);
  }

  @Patch(':productId/revisions/:revisionId')
  @Permissions('products:update')
  @ApiAuth({
    type: ProductRevisionResDto,
    summary: 'Update product revision',
  })
  updateProductRevision(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
    @Body() reqDto: UpdateProductRevisionReqDto,
  ): Promise<ProductRevisionResDto> {
    return this.productsService.updateProductRevision(productId, revisionId, reqDto);
  }

  @Get(':productId/revisions/:revisionId/bom-tree')
  @Permissions('products:read')
  @ApiAuth({
    type: BomTreeNodeResDto,
    summary: 'Get product BOM tree',
  })
  getBomTree(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
  ): Promise<BomTreeNodeResDto> {
    return this.productsService.getBomTree(productId, revisionId);
  }

  @Post(':productId/revisions/:revisionId/bom-lines')
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: BomLineResDto,
    summary: 'Create BOM line',
    statusCode: HttpStatus.CREATED,
  })
  createBomLine(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
    @Body() reqDto: CreateBomLineReqDto,
  ): Promise<BomLineResDto> {
    return this.productsService.createBomLine(productId, revisionId, reqDto);
  }

  @Patch(':productId/revisions/:revisionId/bom-lines/:bomLineId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: BomLineResDto,
    summary: 'Update BOM line',
  })
  updateBomLine(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
    @UUIDParam('bomLineId') bomLineId: string,
    @Body() reqDto: UpdateBomLineReqDto,
  ): Promise<BomLineResDto> {
    return this.productsService.updateBomLine(productId, revisionId, bomLineId, reqDto);
  }

  @Delete(':productId/revisions/:revisionId/bom-lines/:bomLineId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: BomLineResDto,
    summary: 'Delete BOM line',
  })
  deleteBomLine(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
    @UUIDParam('bomLineId') bomLineId: string,
  ): Promise<BomLineResDto> {
    return this.productsService.deleteBomLine(productId, revisionId, bomLineId);
  }

  @Get(':productId/revisions/:revisionId/items/:itemId/routing')
  @Permissions('products:read')
  @ApiAuth({
    type: RoutingStepResDto,
    summary: 'Get item routing',
    isArray: true,
  })
  getRouting(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
    @UUIDParam('itemId') itemId: string,
  ): Promise<RoutingStepResDto[]> {
    return this.productsService.getRouting(productId, revisionId, itemId);
  }

  @Put(':productId/revisions/:revisionId/items/:itemId/routing')
  @Permissions('products:routing-manage')
  @ApiAuth({
    type: RoutingStepResDto,
    summary: 'Replace item routing',
    isArray: true,
  })
  updateRouting(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: UpdateRoutingReqDto,
  ): Promise<RoutingStepResDto[]> {
    return this.productsService.updateRouting(productId, revisionId, itemId, reqDto);
  }

  /**
   * Uploads a product image and makes it the product thumbnail.
   *
   * @param productId - Product identifier from the route parameter.
   * @param file - Uploaded multipart image file from the `image` field.
   * @param user - Authenticated user payload used for upload ownership metadata.
   * @returns Updated product response with the new public image URL.
   */
  @Post(':productId/image')
  @Permissions('products:update')
  @UseInterceptors(FileInterceptor(PRODUCT_IMAGE_FIELD_NAME, PRODUCT_IMAGE_MULTER_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [PRODUCT_IMAGE_FIELD_NAME],
      properties: {
        [PRODUCT_IMAGE_FIELD_NAME]: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiAuth({
    type: ProductResDto,
    summary: 'Upload product image',
  })
  uploadProductImage(
    @UUIDParam('productId') productId: string,
    @UploadedFile() file: ProductImageFile,
    @User() user: JwtPayloadType,
  ): Promise<ProductResDto> {
    return this.productsService.uploadProductImage(productId, file, user.sub);
  }

  /**
   * Removes the current product image and clears the product thumbnail URL.
   *
   * @param productId - Product identifier from the route parameter.
   * @returns Updated product response with `imageUrl` cleared.
   */
  @Delete(':productId/image')
  @Permissions('products:update')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Delete product image',
  })
  deleteProductImage(@UUIDParam('productId') productId: string): Promise<ProductResDto> {
    return this.productsService.deleteProductImage(productId);
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

  @Post(':productId/copy')
  @Permissions('products:copy')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Copy product',
    statusCode: HttpStatus.CREATED,
  })
  copyProduct(@UUIDParam('productId') productId: string): Promise<ProductResDto> {
    return this.productsService.copyProduct(productId);
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

  @Patch(':productId/lock')
  @Permissions('products:lock')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Lock product',
  })
  lockProduct(@UUIDParam('productId') productId: string): Promise<ProductResDto> {
    return this.productsService.lockProduct(productId);
  }

  /**
   * Opens a locked product so its master data, BOM, and routing can be edited again.
   *
   * @param productId - Product identifier from the route parameter.
   * @returns Updated product response DTO with active status.
   */
  @Patch(':productId/unlock')
  @Permissions('products:lock')
  @ApiAuth({
    type: ProductResDto,
    summary: 'Unlock product',
  })
  unlockProduct(@UUIDParam('productId') productId: string): Promise<ProductResDto> {
    return this.productsService.unlockProduct(productId);
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
