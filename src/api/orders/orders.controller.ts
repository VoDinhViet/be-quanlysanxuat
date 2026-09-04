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
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateOrderPaymentReqDto } from './dto/create-order-payment.req.dto';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { OrderItemResDto } from './dto/order-item.res.dto';
import { OrderPaymentResDto } from './dto/order-payment.res.dto';
import { OrderResDto } from './dto/order.res.dto';
import { OrderStatsResDto } from './dto/order-stats.res.dto';
import { PageOrderResDto } from './dto/page-order.res.dto';
import { RejectOrderReqDto } from './dto/reject-order.req.dto';
import { UpdateOrderReqDto } from './dto/update-order.req.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Permissions('orders:read')
  @ApiAuth({
    type: PageOrderResDto,
    summary: 'List orders',
    isPaginated: true,
  })
  getOrders(
    @Query() reqDto: GetOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PageOrderResDto>> {
    return this.ordersService.getOrders(reqDto);
  }

  // Declared before ':orderId' so "stats" isn't captured as a UUID path param.
  @Get('stats')
  @Permissions('orders:read')
  @ApiAuth({
    type: OrderStatsResDto,
    summary:
      'Get order dashboard stats (totals, month/week trends, delivered/in-progress/overdue/completed)',
  })
  getOrderStats(): Promise<OrderStatsResDto> {
    return this.ordersService.getOrderStats();
  }

  @Get(':orderId')
  @Permissions('orders:read')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Get order detail',
  })
  getOrder(@UUIDParam('orderId') orderId: string): Promise<OrderResDto> {
    return this.ordersService.getOrder(orderId);
  }

  @Get(':orderId/items')
  @Permissions('orders:read')
  @ApiAuth({
    type: OrderItemResDto,
    summary: 'Danh sách dòng sản phẩm của đơn hàng',
    isArray: true,
  })
  getOrderItems(
    @UUIDParam('orderId') orderId: string,
  ): Promise<OrderItemResDto[]> {
    return this.ordersService.getOrderItems(orderId);
  }

  @Get(':orderId/payments')
  @Permissions('orders:read')
  @ApiAuth({
    type: OrderPaymentResDto,
    summary: 'Lịch sử thanh toán của đơn hàng',
    isArray: true,
  })
  getOrderPayments(
    @UUIDParam('orderId') orderId: string,
  ): Promise<OrderPaymentResDto[]> {
    return this.ordersService.getOrderPayments(orderId);
  }

  @Post(':orderId/payments')
  @Permissions('orders:update')
  @ApiAuth({
    summary:
      'Ghi nhận một lần thanh toán — amount âm để đảo một lần ghi nhận trước đó',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createOrderPayment(
    @UUIDParam('orderId') orderId: string,
    @Body() reqDto: CreateOrderPaymentReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ordersService.createOrderPayment(
      orderId,
      reqDto,
      payload.userId,
    );
  }

  @Post()
  @Permissions('orders:create')
  @ApiAuth({
    summary: 'Create order',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createOrder(
    @Body() reqDto: CreateOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ordersService.createOrder(reqDto, payload.userId);
  }

  @Patch(':orderId')
  @Permissions('orders:update')
  @ApiAuth({
    summary:
      'Update order (blocked once status is COMPLETED, CANCELLED, or PENDING_CONFIRMATION) — editing a REJECTED order without sending `status` reverts it to DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateOrder(
    @UUIDParam('orderId') orderId: string,
    @Body() reqDto: UpdateOrderReqDto,
  ): Promise<void> {
    return this.ordersService.updateOrder(orderId, reqDto);
  }

  @Post(':orderId/approve')
  @Permissions('orders:approve')
  @ApiAuth({
    summary:
      'Approve an order (director-level) — PENDING_CONFIRMATION → AWAITING_PRODUCTION',
    statusCode: HttpStatus.NO_CONTENT,
  })
  approveOrder(
    @UUIDParam('orderId') orderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ordersService.approveOrder(orderId, payload.userId);
  }

  @Post(':orderId/reject')
  @Permissions('orders:approve')
  @ApiAuth({
    summary:
      'Reject an order (director-level) — PENDING_CONFIRMATION → REJECTED, reason required',
    statusCode: HttpStatus.NO_CONTENT,
  })
  rejectOrder(
    @UUIDParam('orderId') orderId: string,
    @Body() reqDto: RejectOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ordersService.rejectOrder(orderId, reqDto, payload.userId);
  }

  @Delete(':orderId')
  @Permissions('orders:delete')
  @ApiAuth({
    summary: 'Delete an order — only while DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOrder(@UUIDParam('orderId') orderId: string): Promise<void> {
    return this.ordersService.deleteOrder(orderId);
  }
}
