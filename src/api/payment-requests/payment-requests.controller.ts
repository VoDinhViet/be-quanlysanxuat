import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { XLSX_MIME } from '../../common/utils/excel.util';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CancelPaymentRequestReqDto } from './dto/cancel-payment-request.req.dto';
import { ExportPaymentRequestsReqDto } from './dto/export-payment-requests.req.dto';
import { GetPaymentRequestLogsReqDto } from './dto/get-payment-request-logs.req.dto';
import { GetPaymentRequestsReqDto } from './dto/get-payment-requests.req.dto';
import { PagePaymentRequestResDto } from './dto/page-payment-request.res.dto';
import { PaymentRequestLogResDto } from './dto/payment-request-log.res.dto';
import { PaymentRequestResDto } from './dto/payment-request.res.dto';
import { PaymentRequestsService } from './payment-requests.service';

@ApiTags('Payment Requests')
@Controller('payment-requests')
export class PaymentRequestsController {
  constructor(
    private readonly paymentRequestsService: PaymentRequestsService,
  ) {}

  @Get()
  @Permissions('purchasing:read')
  @ApiAuth({
    type: PagePaymentRequestResDto,
    summary: 'List yêu cầu thanh toán',
    isPaginated: true,
  })
  getPaymentRequests(
    @Query() reqDto: GetPaymentRequestsReqDto,
  ): Promise<OffsetPaginatedDto<PagePaymentRequestResDto>> {
    return this.paymentRequestsService.getPaymentRequests(reqDto);
  }

  // Khai trước ':paymentRequestId' để 'export' không bị bắt nhầm thành id.
  @Get('export')
  @Permissions('purchasing:read')
  @ApiAuth({
    summary:
      'Xuất Excel danh sách yêu cầu thanh toán — cùng bộ lọc GET /payment-requests, không phân trang',
    fileType: XLSX_MIME,
  })
  exportPaymentRequests(
    @Query() reqDto: ExportPaymentRequestsReqDto,
  ): Promise<StreamableFile> {
    return this.paymentRequestsService.exportPaymentRequests(reqDto);
  }

  @Get(':paymentRequestId')
  @Permissions('purchasing:read')
  @ApiAuth({
    type: PaymentRequestResDto,
    summary: 'Chi tiết yêu cầu thanh toán',
  })
  getPaymentRequest(
    @UUIDParam('paymentRequestId') paymentRequestId: string,
  ): Promise<PaymentRequestResDto> {
    return this.paymentRequestsService.getPaymentRequest(paymentRequestId);
  }

  @Post(':paymentRequestId/mark-paid')
  @Permissions('purchasing:approve')
  @ApiAuth({
    summary: 'Đánh dấu đã thanh toán — PENDING → PAID',
    statusCode: HttpStatus.NO_CONTENT,
  })
  markPaymentRequestPaid(
    @UUIDParam('paymentRequestId') paymentRequestId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.paymentRequestsService.markPaymentRequestPaid(
      paymentRequestId,
      payload.userId,
    );
  }

  @Post(':paymentRequestId/cancel')
  @Permissions('purchasing:approve')
  @ApiAuth({
    summary: 'Huỷ yêu cầu thanh toán — PENDING → CANCELLED, lý do bắt buộc',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelPaymentRequest(
    @UUIDParam('paymentRequestId') paymentRequestId: string,
    @Body() reqDto: CancelPaymentRequestReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.paymentRequestsService.cancelPaymentRequest(
      paymentRequestId,
      reqDto,
      payload.userId,
    );
  }

  @Get(':paymentRequestId/logs')
  @Permissions('purchasing:read')
  @ApiAuth({
    type: PaymentRequestLogResDto,
    summary:
      'Lịch sử thao tác của yêu cầu thanh toán — thời gian, người thực hiện, hành động, nội dung',
    isPaginated: true,
  })
  getPaymentRequestLogs(
    @UUIDParam('paymentRequestId') paymentRequestId: string,
    @Query() reqDto: GetPaymentRequestLogsReqDto,
  ): Promise<OffsetPaginatedDto<PaymentRequestLogResDto>> {
    return this.paymentRequestsService.getPaymentRequestLogs(
      paymentRequestId,
      reqDto,
    );
  }
}
