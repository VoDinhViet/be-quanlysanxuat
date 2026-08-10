import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateQuotationReqDto } from './dto/create-quotation.req.dto';
import { GetQuotationsReqDto } from './dto/get-quotations.req.dto';
import { PageQuotationResDto } from './dto/page-quotation.res.dto';
import { QuotationResDto } from './dto/quotation.res.dto';
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
    summary: 'Lập báo giá — chọn dòng ĐXMH đã duyệt + một NCC',
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
}
