import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateProductOperationReqDto } from './dto/create-product-operation.req.dto';
import { ProductOperationResDto } from './dto/product-operation.res.dto';
import { UpdateProductOperationReqDto } from './dto/update-product-operation.req.dto';
import { ProductOperationsService } from './product-operations.service';

@ApiTags('Products')
@Controller('products/:productId/operations')
export class ProductOperationsController {
  constructor(
    private readonly productOperationsService: ProductOperationsService,
  ) {}

  @Get()
  @Permissions('products:read')
  @ApiPublic({
    type: ProductOperationResDto,
    summary: "Get a product's own routing (Cấp 0, Công đoạn), in run order",
    isArray: true,
  })
  getProductOperations(
    @UUIDParam('productId') productId: string,
  ): Promise<ProductOperationResDto[]> {
    return this.productOperationsService.getProductOperations(productId);
  }

  @Post()
  @Permissions('products:bom-manage')
  @ApiAuth({
    summary: 'Add a routing step ("[+]") for this product',
    statusCode: HttpStatus.CREATED,
  })
  createProductOperation(
    @UUIDParam('productId') productId: string,
    @Body() reqDto: CreateProductOperationReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.productOperationsService.createProductOperation(
      productId,
      reqDto,
      payload.userId,
    );
  }

  @Patch(':stepId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    summary: 'Edit a routing step (STT chạy/note)',
  })
  updateProductOperation(
    @UUIDParam('productId') productId: string,
    @UUIDParam('stepId') stepId: string,
    @Body() reqDto: UpdateProductOperationReqDto,
  ): Promise<void> {
    return this.productOperationsService.updateProductOperation(
      productId,
      stepId,
      reqDto,
    );
  }

  @Delete(':stepId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    summary: 'Delete a routing step ("[X]")',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteProductOperation(
    @UUIDParam('productId') productId: string,
    @UUIDParam('stepId') stepId: string,
  ): Promise<void> {
    return this.productOperationsService.deleteProductOperation(
      productId,
      stepId,
    );
  }
}
