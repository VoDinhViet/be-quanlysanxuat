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

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { ApproveQuotationReqDto } from './dto/approve-quotation.req.dto';
import { CreateQuotationReqDto } from './dto/create-quotation.req.dto';
import { GetQuotationsReqDto } from './dto/get-quotations.req.dto';
import { PageQuotationResDto } from './dto/page-quotation.res.dto';
import { QuotationResDto } from './dto/quotation.res.dto';
import { RejectQuotationReqDto } from './dto/reject-quotation.req.dto';
import { UpdateQuotationReqDto } from './dto/update-quotation.req.dto';
import { PurchaseQuotationsService } from './purchase-quotations.service';

@ApiTags('Purchase Quotations')
@Controller('purchase-quotations')
export class PurchaseQuotationsController {
  constructor(
    private readonly purchaseQuotationsService: PurchaseQuotationsService,
  ) {}

  @Get()
  @Permissions('purchasing:read')
  @ApiAuth({
    type: PageQuotationResDto,
    summary: 'List báo giá (RFQ)',
    isPaginated: true,
  })
  getQuotations(
    @Query() reqDto: GetQuotationsReqDto,
  ): Promise<OffsetPaginatedDto<PageQuotationResDto>> {
    return this.purchaseQuotationsService.getQuotations(reqDto);
  }

  @Get(':quotationId')
  @Permissions('purchasing:read')
  @ApiAuth({
    type: QuotationResDto,
    summary: 'Get báo giá detail',
  })
  getQuotation(
    @UUIDParam('quotationId') quotationId: string,
  ): Promise<QuotationResDto> {
    return this.purchaseQuotationsService.getQuotation(quotationId);
  }

  @Post()
  @Permissions('purchasing:create')
  @ApiAuth({
    summary:
      'Lập RFQ — chọn dòng ĐXMH đã duyệt, mỗi vật tư kèm danh sách NCC được hỏi giá',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createQuotation(
    @Body() reqDto: CreateQuotationReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseQuotationsService.createQuotation(
      reqDto,
      payload.userId,
    );
  }

  @Patch(':quotationId')
  @Permissions('purchasing:update')
  @ApiAuth({
    summary: 'Sửa RFQ (replace-all vật tư + NCC) — chỉ khi DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateQuotation(
    @UUIDParam('quotationId') quotationId: string,
    @Body() reqDto: UpdateQuotationReqDto,
  ): Promise<void> {
    return this.purchaseQuotationsService.updateQuotation(quotationId, reqDto);
  }

  @Delete(':quotationId')
  @Permissions('purchasing:delete')
  @ApiAuth({
    summary: 'Xoá RFQ — chỉ khi DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteQuotation(
    @UUIDParam('quotationId') quotationId: string,
  ): Promise<void> {
    return this.purchaseQuotationsService.deleteQuotation(quotationId);
  }

  @Post(':quotationId/send')
  @Permissions('purchasing:update')
  @ApiAuth({
    summary: 'Gửi duyệt — DRAFT → PENDING_APPROVAL',
    statusCode: HttpStatus.NO_CONTENT,
  })
  sendQuotation(
    @UUIDParam('quotationId') quotationId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseQuotationsService.sendQuotation(
      quotationId,
      payload.userId,
    );
  }

  @Post(':quotationId/approve')
  @Permissions('purchasing:approve')
  @ApiAuth({
    summary:
      'Duyệt — PENDING_APPROVAL → APPROVED, chọn NCC thắng thầu từng vật tư, tự sinh PO Draft',
    statusCode: HttpStatus.NO_CONTENT,
  })
  approveQuotation(
    @UUIDParam('quotationId') quotationId: string,
    @Body() reqDto: ApproveQuotationReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseQuotationsService.approveQuotation(
      quotationId,
      reqDto,
      payload.userId,
    );
  }

  @Post(':quotationId/reject')
  @Permissions('purchasing:approve')
  @ApiAuth({
    summary: 'Từ chối — PENDING_APPROVAL → CANCELLED, lý do bắt buộc',
    statusCode: HttpStatus.NO_CONTENT,
  })
  rejectQuotation(
    @UUIDParam('quotationId') quotationId: string,
    @Body() reqDto: RejectQuotationReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseQuotationsService.rejectQuotation(
      quotationId,
      reqDto,
      payload.userId,
    );
  }

  @Post(':quotationId/recall')
  @Permissions('purchasing:update')
  @ApiAuth({
    summary:
      'Thu hồi RFQ đã duyệt — APPROVED → DRAFT, huỷ PO Draft đã sinh (chặn nếu đã có PO ORDERED)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  recallQuotation(
    @UUIDParam('quotationId') quotationId: string,
  ): Promise<void> {
    return this.purchaseQuotationsService.recallQuotation(quotationId);
  }
}
