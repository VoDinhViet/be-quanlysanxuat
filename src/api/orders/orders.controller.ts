import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { OrderResDto } from './dto/order.res.dto';
import { OrderStatsResDto } from './dto/order-stats.res.dto';
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
    type: OrderResDto,
    summary: 'List orders',
    isPaginated: true,
  })
  getOrders(@Query() reqDto: GetOrdersReqDto): Promise<OffsetPaginatedDto<OrderResDto>> {
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
  getOrderDetail(@UUIDParam('orderId') orderId: string): Promise<OrderResDto> {
    return this.ordersService.getOrderDetail(orderId);
  }

  @Post()
  @Permissions('orders:create')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Create order',
    statusCode: HttpStatus.CREATED,
  })
  createOrder(
    @Body() reqDto: CreateOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<OrderResDto> {
    return this.ordersService.createOrder(reqDto, payload.sub);
  }

  @Patch(':orderId')
  @Permissions('orders:update')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Update order (blocked once status is COMPLETED or CANCELLED)',
  })
  updateOrder(
    @UUIDParam('orderId') orderId: string,
    @Body() reqDto: UpdateOrderReqDto,
  ): Promise<OrderResDto> {
    return this.ordersService.updateOrder(orderId, reqDto);
  }

  @Delete(':orderId')
  @Permissions('orders:delete')
  @ApiAuth({
    summary: 'Delete order (soft delete, blocked once status is COMPLETED or CANCELLED)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOrder(@UUIDParam('orderId') orderId: string): Promise<void> {
    return this.ordersService.deleteOrder(orderId);
  }

  @Post(':orderId/approve')
  @Permissions('orders:approve')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Approve an order (director-level) — PENDING_CONFIRMATION → AWAITING_PRODUCTION',
  })
  approveOrder(
    @UUIDParam('orderId') orderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<OrderResDto> {
    return this.ordersService.approveOrder(orderId, payload.sub);
  }

  @Post(':orderId/reject')
  @Permissions('orders:approve')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Reject an order (director-level) — PENDING_CONFIRMATION → DRAFT, reason required',
  })
  rejectOrder(
    @UUIDParam('orderId') orderId: string,
    @Body() reqDto: RejectOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<OrderResDto> {
    return this.ordersService.rejectOrder(orderId, reqDto, payload.sub);
  }
}
