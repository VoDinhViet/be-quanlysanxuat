import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateOutsourcingReceiptReqDto } from './dto/create-outsourcing-receipt.req.dto';
import { GetOutsourcingReceiptsReqDto } from './dto/get-outsourcing-receipts.req.dto';
import { GetPendingOrderItemsReqDto } from './dto/get-pending-order-items.req.dto';
import { OutsourcingReceiptResDto } from './dto/outsourcing-receipt.res.dto';
import { PageOutsourcingReceiptResDto } from './dto/page-outsourcing-receipt.res.dto';
import { PendingOrderItemResDto } from './dto/pending-order-item.res.dto';
import { OutsourcingReceiptsService } from './outsourcing-receipts.service';

@ApiTags('Outsourcing Receipts')
@Controller('outsourcing-receipts')
export class OutsourcingReceiptsController {
  constructor(
    private readonly outsourcingReceiptsService: OutsourcingReceiptsService,
  ) {}

  @Get()
  @Permissions('outsourcing:read')
  @ApiAuth({
    type: PageOutsourcingReceiptResDto,
    summary: 'List phiếu nhận gia công ngoài (OS-IN)',
    isPaginated: true,
  })
  getOutsourcingReceipts(
    @Query() reqDto: GetOutsourcingReceiptsReqDto,
  ): Promise<OffsetPaginatedDto<PageOutsourcingReceiptResDto>> {
    return this.outsourcingReceiptsService.getOutsourcingReceipts(reqDto);
  }

  @Get('pending-order-items')
  @Permissions('outsourcing:read')
  @ApiAuth({
    type: PendingOrderItemResDto,
    summary:
      'Popup "chọn hàng cần nhận" — dòng OS-OUT thuộc phiếu POSTED còn SL chưa nhận hết',
    isPaginated: true,
  })
  getPendingOrderItems(
    @Query() reqDto: GetPendingOrderItemsReqDto,
  ): Promise<OffsetPaginatedDto<PendingOrderItemResDto>> {
    return this.outsourcingReceiptsService.getPendingOrderItems(reqDto);
  }

  @Get(':outsourcingReceiptId')
  @Permissions('outsourcing:read')
  @ApiAuth({
    type: OutsourcingReceiptResDto,
    summary: 'Chi tiết phiếu nhận gia công ngoài (OS-IN)',
  })
  getOutsourcingReceipt(
    @UUIDParam('outsourcingReceiptId') outsourcingReceiptId: string,
  ): Promise<OutsourcingReceiptResDto> {
    return this.outsourcingReceiptsService.getOutsourcingReceipt(
      outsourcingReceiptId,
    );
  }

  @Post()
  @Permissions('outsourcing:create')
  @ApiAuth({
    summary:
      'Lập phiếu nhận gia công ngoài (OS-IN), nhiều dòng, có thể gộp nhiều OS-OUT cùng NCC — POSTED ngay, cộng tồn kho nhận theo từng dòng, sinh IQC nếu requiresIqc',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createOutsourcingReceipt(
    @Body() reqDto: CreateOutsourcingReceiptReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outsourcingReceiptsService.createOutsourcingReceipt(
      reqDto,
      payload.userId,
    );
  }

  @Post(':outsourcingReceiptId/cancel')
  @Permissions('outsourcing:update')
  @ApiAuth({
    summary:
      'Huỷ phiếu nhận gia công ngoài — đảo bút toán nếu đã POSTED, chặn nếu đã có IQC trỏ vào',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelOutsourcingReceipt(
    @UUIDParam('outsourcingReceiptId') outsourcingReceiptId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outsourcingReceiptsService.cancelOutsourcingReceipt(
      outsourcingReceiptId,
      payload.userId,
    );
  }
}
