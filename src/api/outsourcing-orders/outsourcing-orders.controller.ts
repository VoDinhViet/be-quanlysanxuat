import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OperationAccessService } from '../operations/operation-access.service';
import { CreateOutsourcingOrderReqDto } from './dto/create-outsourcing-order.req.dto';
import { GetOutsourceableOperationsReqDto } from './dto/get-outsourceable-operations.req.dto';
import { GetOutsourcingOrdersReqDto } from './dto/get-outsourcing-orders.req.dto';
import { OutsourceableOperationResDto } from './dto/outsourceable-operation.res.dto';
import { OutsourcingOrderItemResDto } from './dto/outsourcing-order-item.res.dto';
import { OutsourcingOrderResDto } from './dto/outsourcing-order.res.dto';
import { PageOutsourcingOrderResDto } from './dto/page-outsourcing-order.res.dto';
import { RejectOutsourcingOrderReqDto } from './dto/reject-outsourcing-order.req.dto';
import { OutsourcingOrdersService } from './outsourcing-orders.service';

@ApiTags('Outsourcing Orders')
@Controller('outsourcing-orders')
export class OutsourcingOrdersController {
  constructor(
    private readonly outsourcingOrdersService: OutsourcingOrdersService,
    private readonly operationAccess: OperationAccessService,
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
  async getOutsourceableOperations(
    @Query() reqDto: GetOutsourceableOperationsReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<OffsetPaginatedDto<OutsourceableOperationResDto>> {
    // Có `operationId` = đang xem từ màn "Thực hiện sản xuất" → chỉ công đoạn được phân công.
    if (reqDto.operationId) {
      await this.operationAccess.assertCanAccess(payload, reqDto.operationId);
    }

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
      'Lập phiếu gửi gia công ngoài (OS-OUT) ở trạng thái nháp, nhiều dòng — không đụng tồn kho (mặt hàng gửi là node COMPONENT của Job, không phải item)',
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

  @Patch(':outsourcingOrderId')
  @Permissions('outsourcing:update')
  @ApiAuth({
    summary: 'Sửa phiếu gửi gia công ngoài đang nháp hoặc bị từ chối',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateOutsourcingOrder(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
    @Body() reqDto: CreateOutsourcingOrderReqDto,
  ): Promise<void> {
    return this.outsourcingOrdersService.updateOutsourcingOrder(
      outsourcingOrderId,
      reqDto,
    );
  }

  @Post(':outsourcingOrderId/submit')
  @Permissions('outsourcing:update')
  @ApiAuth({
    summary: 'Gửi duyệt phiếu gia công ngoài (nháp/bị từ chối → chờ duyệt)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  submitOutsourcingOrder(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outsourcingOrdersService.submitOutsourcingOrder(
      outsourcingOrderId,
      payload.userId,
    );
  }

  @Post(':outsourcingOrderId/approve')
  @Permissions('outsourcing:approve')
  @ApiAuth({
    summary: 'Duyệt phiếu gia công ngoài (chờ duyệt → đã duyệt)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  approveOutsourcingOrder(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outsourcingOrdersService.approveOutsourcingOrder(
      outsourcingOrderId,
      payload.userId,
    );
  }

  @Post(':outsourcingOrderId/reject')
  @Permissions('outsourcing:approve')
  @ApiAuth({
    summary:
      'Từ chối phiếu gia công ngoài, bắt buộc lý do (chờ duyệt → bị từ chối)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  rejectOutsourcingOrder(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
    @Body() reqDto: RejectOutsourcingOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outsourcingOrdersService.rejectOutsourcingOrder(
      outsourcingOrderId,
      reqDto,
      payload.userId,
    );
  }

  @Post(':outsourcingOrderId/confirm-send')
  @Permissions('outsourcing:update')
  @ApiAuth({
    summary:
      'Xác nhận xuất gia công ngoài (đã duyệt → đã gửi): từ đây mới nhập hàng về được',
    statusCode: HttpStatus.NO_CONTENT,
  })
  confirmSendOutsourcingOrder(
    @UUIDParam('outsourcingOrderId') outsourcingOrderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outsourcingOrdersService.confirmSendOutsourcingOrder(
      outsourcingOrderId,
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
