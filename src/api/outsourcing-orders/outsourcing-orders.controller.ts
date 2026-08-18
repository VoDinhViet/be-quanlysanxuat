import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateOutsourcingOrderReqDto } from './dto/create-outsourcing-order.req.dto';
import { GetOutsourceableOperationsReqDto } from './dto/get-outsourceable-operations.req.dto';
import { GetOutsourcingOrdersReqDto } from './dto/get-outsourcing-orders.req.dto';
import { OutsourceableOperationResDto } from './dto/outsourceable-operation.res.dto';
import { OutsourcingOrderItemResDto } from './dto/outsourcing-order-item.res.dto';
import { OutsourcingOrderResDto } from './dto/outsourcing-order.res.dto';
import { PageOutsourcingOrderResDto } from './dto/page-outsourcing-order.res.dto';
import { OutsourcingOrdersService } from './outsourcing-orders.service';

@ApiTags('Outsourcing Orders')
@Controller('outsourcing-orders')
export class OutsourcingOrdersController {
  constructor(
    private readonly outsourcingOrdersService: OutsourcingOrdersService,
  ) {}

  @Get()
  @Permissions('outsourcing:read')
  @ApiAuth({
    type: PageOutsourcingOrderResDto,
    summary: 'List phiếu gửi gia công ngoài (OS-OUT)',
    isPaginated: true,
  })
  getOutsourcingOrders(
    @Query() reqDto: GetOutsourcingOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PageOutsourcingOrderResDto>> {
    return this.outsourcingOrdersService.getOutsourcingOrders(reqDto);
  }

  @Get('outsourceable-operations')
  @Permissions('outsourcing:read')
  @ApiAuth({
    type: OutsourceableOperationResDto,
    summary:
      'Popup "chọn part cần gia công" — công đoạn OUTSOURCE của Job đang IN_PROGRESS, kèm định mức/đã gửi/còn được phép gửi',
    isPaginated: true,
  })
  getOutsourceableOperations(
    @Query() reqDto: GetOutsourceableOperationsReqDto,
  ): Promise<OffsetPaginatedDto<OutsourceableOperationResDto>> {
    return this.outsourcingOrdersService.getOutsourceableOperations(reqDto);
  }

  @Get(':outsourcingOrderId')
  @Permissions('outsourcing:read')
  @ApiAuth({
    type: OutsourcingOrderResDto,
    summary: 'Chi tiết phiếu gửi gia công ngoài (OS-OUT)',
  })
  getOutsourcingOrder(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
  ): Promise<OutsourcingOrderResDto> {
    return this.outsourcingOrdersService.getOutsourcingOrder(
      outsourcingOrderId,
    );
  }

  @Get(':outsourcingOrderId/items')
  @Permissions('outsourcing:read')
  @ApiAuth({
    type: OutsourcingOrderItemResDto,
    summary: 'Danh sách chi tiết dòng của phiếu gửi gia công ngoài (OS-OUT)',
    isArray: true,
  })
  getOrderItems(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
  ): Promise<OutsourcingOrderItemResDto[]> {
    return this.outsourcingOrdersService.getOrderItems(outsourcingOrderId);
  }

  @Post()
  @Permissions('outsourcing:create')
  @ApiAuth({
    summary:
      'Lập phiếu gửi gia công ngoài (OS-OUT), nhiều dòng — POSTED ngay, không đụng tồn kho (mặt hàng gửi luôn là WIP, kho không quản tồn WIP)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createOutsourcingOrder(
    @Body() reqDto: CreateOutsourcingOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outsourcingOrdersService.createOutsourcingOrder(
      reqDto,
      payload.userId,
    );
  }

  @Post(':outsourcingOrderId/cancel')
  @Permissions('outsourcing:update')
  @ApiAuth({
    summary: 'Huỷ phiếu gửi gia công ngoài — chặn nếu còn OS-IN chưa huỷ',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelOutsourcingOrder(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
  ): Promise<void> {
    return this.outsourcingOrdersService.cancelOutsourcingOrder(
      outsourcingOrderId,
    );
  }
}
