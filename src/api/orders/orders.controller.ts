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
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { OrderResDto } from './dto/order.res.dto';
import { OrderStatsResDto } from './dto/order-stats.res.dto';
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
  getOrders(
    @Query() reqDto: GetOrdersReqDto,
  ): Promise<OffsetPaginatedDto<OrderResDto>> {
    return this.ordersService.getOrders(reqDto);
  }

  // Declared before ':id' so "stats" isn't captured as a UUID path param.
  @Get('stats')
  @Permissions('orders:read')
  @ApiAuth({
    type: OrderStatsResDto,
    summary: 'Get order stats (total orders/value, count by status, overdue)',
  })
  getOrderStats(): Promise<OrderStatsResDto> {
    return this.ordersService.getOrderStats();
  }

  @Get(':id')
  @Permissions('orders:read')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Get order detail',
  })
  getOrderDetail(@UUIDParam('id') id: string): Promise<OrderResDto> {
    return this.ordersService.getOrderDetail(id);
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

  @Patch(':id')
  @Permissions('orders:update')
  @ApiAuth({
    type: OrderResDto,
    summary: 'Update order',
  })
  updateOrder(
    @UUIDParam('id') id: string,
    @Body() reqDto: UpdateOrderReqDto,
  ): Promise<OrderResDto> {
    return this.ordersService.updateOrder(id, reqDto);
  }

  @Delete(':id')
  @Permissions('orders:delete')
  @ApiAuth({
    summary: 'Delete order (soft delete)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOrder(@UUIDParam('id') id: string): Promise<void> {
    return this.ordersService.deleteOrder(id);
  }
}
