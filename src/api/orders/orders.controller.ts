import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { User } from '../../decorators/user.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import {
  MAX_ORDER_PDF_SIZE_IN_BYTES,
  ORDER_FILE_FIELD_NAME,
  ORDER_PDF_UPLOAD_DIR,
} from './constants/order-file.constants';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { OrderFileResDto } from './dto/order-file.res.dto';
import { OrderProductOptionResDto } from './dto/order-product-option.res.dto';
import { OrderProductionResDto } from './dto/order-production.res.dto';
import { OrderResDto } from './dto/order.res.dto';
import { RejectOrderReqDto } from './dto/reject-order.req.dto';
import { UpdateOrderReqDto } from './dto/update-order.req.dto';
import { OrdersService } from './orders.service';
import type { OrderStoredFile } from './types/order-file.type';

const ORDER_PDF_MULTER_OPTIONS: MulterOptions = {
  dest: ORDER_PDF_UPLOAD_DIR,
  limits: {
    fileSize: MAX_ORDER_PDF_SIZE_IN_BYTES,
    files: 1,
  },
};

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Lists approved orders for production without financial fields or PO PDF files.
   *
   * @param reqDto - Query filters, keyword, and pagination options.
   * @returns Paginated production-safe orders.
   */
  @Get('production')
  @Permissions('orders:read-production')
  @ApiAuth({
    type: OrderProductionResDto,
    summary: 'List production-safe orders',
    isPaginated: true,
  })
  getProductionOrders(
    @Query() reqDto: GetOrdersReqDto,
  ): Promise<OffsetPaginatedDto<OrderProductionResDto>> {
    return this.ordersService.getProductionOrders(reqDto);
  }

  /**
   * Gets one approved order for production without financial fields or PO PDF files.
   *
   * @param orderId - Order identifier from the route parameter.
   * @returns Production-safe order detail.
   */
  @Get('production/:orderId')
  @Permissions('orders:read-production')
  @ApiAuth({
    type: OrderProductionResDto,
    summary: 'Get production-safe order detail',
  })
  getProductionOrderDetail(@UUIDParam('orderId') orderId: string): Promise<OrderProductionResDto> {
    return this.ordersService.getProductionOrderDetail(orderId);
  }

  /**
   * Lists finished-good product options for order entry.
   *
   * @param q - Optional keyword searched by product code or name.
   * @returns Product options with default sale price and technical files.
   */
  @Get('product-options')
  @Permissions('orders:read')
  @ApiAuth({
    type: OrderProductOptionResDto,
    summary: 'List commercial product options',
    isArray: true,
  })
  getProductOptions(@Query('q') q?: string): Promise<OrderProductOptionResDto[]> {
    return this.ordersService.getProductOptions(q);
  }

  /**
   * Lists commercial orders with financial fields and PO PDF metadata.
   *
   * @param reqDto - Query filters, keyword, and pagination options.
   * @returns Paginated commercial orders.
   */
  @Get()
  @Permissions('orders:read')
  @ApiAuth({
    type: OrderResDto,
    summary: 'List commercial orders',
    isPaginated: true,
  })
  getOrders(@Query() reqDto: GetOrdersReqDto): Promise<OffsetPaginatedDto<OrderResDto>> {
    return this.ordersService.getOrders(reqDto);
  }

  /**
   * Creates a commercial order from JSON payload.
   *
   * @param reqDto - Client, PO/PR, due date, VAT, note, and product lines.
   * @param user - Authenticated user payload used as creator metadata.
   * @returns Created commercial order detail.
   */
  @Post()
  @Permissions('orders:create')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Create commercial order',
    statusCode: HttpStatus.CREATED,
  })
  createOrder(
    @Body() reqDto: CreateOrderReqDto,
    @User() user: JwtPayloadType,
  ): Promise<OrderResDto> {
    return this.ordersService.createOrder(reqDto, user.sub);
  }

  /**
   * Gets commercial order detail with financial fields and PO PDF metadata.
   *
   * @param orderId - Order identifier from the route parameter.
   * @returns Commercial order detail.
   */
  @Get(':orderId')
  @Permissions('orders:read')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Get commercial order detail',
  })
  getOrderDetail(@UUIDParam('orderId') orderId: string): Promise<OrderResDto> {
    return this.ordersService.getOrderDetail(orderId);
  }

  /**
   * Updates an order before approval and returns rejected orders to pending approval.
   *
   * @param orderId - Order identifier from the route parameter.
   * @param reqDto - Editable order fields and optional replacement item lines.
   * @param user - Authenticated user payload used as updater metadata.
   * @returns Updated commercial order detail.
   */
  @Patch(':orderId')
  @Permissions('orders:update')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Update commercial order',
  })
  updateOrder(
    @UUIDParam('orderId') orderId: string,
    @Body() reqDto: UpdateOrderReqDto,
    @User() user: JwtPayloadType,
  ): Promise<OrderResDto> {
    return this.ordersService.updateOrder(orderId, reqDto, user.sub);
  }

  /**
   * Soft-deletes an order before approval.
   *
   * @param orderId - Order identifier from the route parameter.
   * @param user - Authenticated user payload used as updater metadata.
   * @returns Deleted order detail.
   */
  @Delete(':orderId')
  @Permissions('orders:delete')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Delete commercial order',
  })
  deleteOrder(
    @UUIDParam('orderId') orderId: string,
    @User() user: JwtPayloadType,
  ): Promise<OrderResDto> {
    return this.ordersService.deleteOrder(orderId, user.sub);
  }

  /**
   * Approves a pending order.
   *
   * @param orderId - Order identifier from the route parameter.
   * @param user - Authenticated director/admin payload.
   * @returns Approved commercial order detail.
   */
  @Post(':orderId/approve')
  @Permissions('orders:approve')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Approve commercial order',
  })
  approveOrder(
    @UUIDParam('orderId') orderId: string,
    @User() user: JwtPayloadType,
  ): Promise<OrderResDto> {
    return this.ordersService.approveOrder(orderId, user.sub);
  }

  /**
   * Rejects a pending order with a reason.
   *
   * @param orderId - Order identifier from the route parameter.
   * @param reqDto - Rejection reason payload.
   * @param user - Authenticated director/admin payload.
   * @returns Rejected commercial order detail.
   */
  @Post(':orderId/reject')
  @Permissions('orders:approve')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Reject commercial order',
  })
  rejectOrder(
    @UUIDParam('orderId') orderId: string,
    @Body() reqDto: RejectOrderReqDto,
    @User() user: JwtPayloadType,
  ): Promise<OrderResDto> {
    return this.ordersService.rejectOrder(orderId, reqDto, user.sub);
  }

  /**
   * Uploads a customer PO PDF for an editable order.
   *
   * @param orderId - Order identifier from the route parameter.
   * @param file - Uploaded PDF file from the `file` field.
   * @param user - Authenticated user payload used as uploader metadata.
   * @returns Created order file metadata.
   */
  @Post(':orderId/files/order-pdf')
  @Permissions('orders:update')
  @UseInterceptors(FileInterceptor(ORDER_FILE_FIELD_NAME, ORDER_PDF_MULTER_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [ORDER_FILE_FIELD_NAME],
      properties: {
        [ORDER_FILE_FIELD_NAME]: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiAuth({
    type: OrderFileResDto,
    summary: 'Upload order PO PDF',
    statusCode: HttpStatus.CREATED,
  })
  uploadOrderPdf(
    @UUIDParam('orderId') orderId: string,
    @UploadedFile() file: OrderStoredFile,
    @User() user: JwtPayloadType,
  ): Promise<OrderFileResDto> {
    return this.ordersService.uploadOrderPdf(orderId, file, user.sub);
  }

  /**
   * Soft-deletes a customer PO PDF from an editable order.
   *
   * @param orderId - Order identifier from the route parameter.
   * @param fileId - Order file identifier from the route parameter.
   * @param user - Authenticated user payload used as updater metadata.
   * @returns Deleted order file metadata.
   */
  @Delete(':orderId/files/:fileId')
  @Permissions('orders:update')
  @ApiAuth({
    type: OrderFileResDto,
    summary: 'Delete order PO PDF',
  })
  deleteOrderFile(
    @UUIDParam('orderId') orderId: string,
    @UUIDParam('fileId') fileId: string,
    @User() user: JwtPayloadType,
  ): Promise<OrderFileResDto> {
    return this.ordersService.deleteOrderFile(orderId, fileId, user.sub);
  }
}
