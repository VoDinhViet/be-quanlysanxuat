import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateOutboundOrderReqDto } from './dto/create-outbound-order.req.dto';
import { GetOutboundOrdersReqDto } from './dto/get-outbound-orders.req.dto';
import { GetUnfulfilledOrderItemsReqDto } from './dto/get-unfulfilled-order-items.req.dto';
import { OutboundOrderItemResDto } from './dto/outbound-order-item.res.dto';
import { OutboundOrderResDto } from './dto/outbound-order.res.dto';
import { PageOutboundOrderResDto } from './dto/page-outbound-order.res.dto';
import { UnfulfilledOrderItemResDto } from './dto/unfulfilled-order-item.res.dto';
import { OutboundOrdersService } from './outbound-orders.service';

@ApiTags('Outbound Orders')
@Controller('outbound-orders')
export class OutboundOrdersController {
  constructor(private readonly outboundOrdersService: OutboundOrdersService) {}

  @Get()
  @Permissions('outbound:read')
  @ApiAuth({
    type: PageOutboundOrderResDto,
    summary: 'List phiếu giao hàng (DO)',
    isPaginated: true,
  })
  getOutboundOrders(
    @Query() reqDto: GetOutboundOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PageOutboundOrderResDto>> {
    return this.outboundOrdersService.getOutboundOrders(reqDto);
  }

  @Get('unfulfilled-order-items')
  @Permissions('outbound:read')
  @ApiAuth({
    type: UnfulfilledOrderItemResDto,
    summary:
      'Popup "Chọn PO/Job cần giao" — dòng PO của đơn chưa hoàn thành, chưa lọc theo SL đã giao',
    isPaginated: true,
  })
  getUnfulfilledOrderItems(
    @Query() reqDto: GetUnfulfilledOrderItemsReqDto,
  ): Promise<OffsetPaginatedDto<UnfulfilledOrderItemResDto>> {
    return this.outboundOrdersService.getUnfulfilledOrderItems(reqDto);
  }

  @Get(':outboundOrderId')
  @Permissions('outbound:read')
  @ApiAuth({
    type: OutboundOrderResDto,
    summary: 'Chi tiết phiếu giao hàng (DO)',
  })
  getOutboundOrder(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
  ): Promise<OutboundOrderResDto> {
    return this.outboundOrdersService.getOutboundOrder(outboundOrderId);
  }

  @Get(':outboundOrderId/items')
  @Permissions('outbound:read')
  @ApiAuth({
    type: OutboundOrderItemResDto,
    summary: 'Danh sách chi tiết dòng của phiếu giao hàng (DO)',
    isArray: true,
  })
  getOutboundOrderItems(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
  ): Promise<OutboundOrderItemResDto[]> {
    return this.outboundOrdersService.getOutboundOrderItems(outboundOrderId);
  }

  @Post()
  @Permissions('outbound:create')
  @ApiAuth({
    summary:
      'Lập phiếu giao hàng (DO), nhiều dòng — phase 1: luôn DRAFT, chưa duyệt/chưa xác nhận giao, chưa đụng tồn kho',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createOutboundOrder(
    @Body() reqDto: CreateOutboundOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outboundOrdersService.createOutboundOrder(
      reqDto,
      payload.userId,
    );
  }

  @Post(':outboundOrderId/confirm')
  @Permissions('outbound:update')
  @ApiAuth({
    summary:
      'Xác nhận phiếu (DRAFT → PENDING_DELIVERY) — chặn nếu còn Job nào chưa qua hết OQC',
    statusCode: HttpStatus.NO_CONTENT,
  })
  confirmOutboundOrder(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
  ): Promise<void> {
    return this.outboundOrdersService.confirmOutboundOrder(outboundOrderId);
  }

  @Post(':outboundOrderId/deliver')
  @Permissions('outbound:update')
  @ApiAuth({
    summary:
      'Xác nhận đã giao (PENDING_DELIVERY → DELIVERED) — tự sinh + post phiếu xuất kho SALES, đóng đơn hàng nếu đã giao đủ',
    statusCode: HttpStatus.NO_CONTENT,
  })
  postOutboundOrder(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outboundOrdersService.postOutboundOrder(
      outboundOrderId,
      payload.userId,
    );
  }
}
