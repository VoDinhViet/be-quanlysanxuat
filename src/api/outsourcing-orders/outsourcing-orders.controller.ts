import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateOutsourcingOrderReqDto } from './dto/create-outsourcing-order.req.dto';
import { GetOutsourcingOrdersReqDto } from './dto/get-outsourcing-orders.req.dto';
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

  @Post()
  @Permissions('outsourcing:create')
  @ApiAuth({
    type: OutsourcingOrderResDto,
    summary: 'Lập phiếu gửi gia công ngoài (OS-OUT), luôn DRAFT',
    statusCode: HttpStatus.CREATED,
  })
  createOutsourcingOrder(
    @Body() reqDto: CreateOutsourcingOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<OutsourcingOrderResDto> {
    return this.outsourcingOrdersService.createOutsourcingOrder(
      reqDto,
      payload.userId,
    );
  }

  @Post(':outsourcingOrderId/post')
  @Permissions('outsourcing:update')
  @ApiAuth({
    summary: 'Xác nhận đã gửi hàng (DRAFT → POSTED) — trừ tồn kho gửi',
    statusCode: HttpStatus.NO_CONTENT,
  })
  postOutsourcingOrder(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outsourcingOrdersService.postOutsourcingOrder(
      outsourcingOrderId,
      payload.userId,
    );
  }

  @Post(':outsourcingOrderId/cancel')
  @Permissions('outsourcing:update')
  @ApiAuth({
    summary:
      'Huỷ phiếu gửi gia công ngoài — đảo bút toán nếu đã POSTED, chặn nếu còn OS-IN chưa huỷ',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelOutsourcingOrder(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outsourcingOrdersService.cancelOutsourcingOrder(
      outsourcingOrderId,
      payload.userId,
    );
  }
}
