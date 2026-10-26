import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
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
import { CreateOutboundOrderReqDto } from './dto/create-outbound-order.req.dto';
import { ExportOutboundOrdersReqDto } from './dto/export-outbound-orders.req.dto';
import { GetOutboundOrderStatsReqDto } from './dto/get-outbound-order-stats.req.dto';
import { GetOutboundOrdersReqDto } from './dto/get-outbound-orders.req.dto';
import { GetUnfulfilledOrderItemsReqDto } from './dto/get-unfulfilled-order-items.req.dto';
import { OutboundOrderItemResDto } from './dto/outbound-order-item.res.dto';
import { OutboundOrderResDto } from './dto/outbound-order.res.dto';
import { PageOutboundOrderResDto } from './dto/page-outbound-order.res.dto';
import { RejectOutboundOrderReqDto } from './dto/reject-outbound-order.req.dto';
import { UnfulfilledOrderItemResDto } from './dto/unfulfilled-order-item.res.dto';
import { OutboundOrderStatsResDto } from './dto/outbound-order-stats.res.dto';
import { UpdateOutboundOrderInvoiceReqDto } from './dto/update-outbound-order-invoice.req.dto';
import { UpdateOutboundOrderReqDto } from './dto/update-outbound-order.req.dto';
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

  // Khai trước ':outboundOrderId' để 'stats' không bị bắt nhầm thành id.
  @Get('stats')
  @Permissions('outbound:read')
  @ApiAuth({
    type: OutboundOrderStatsResDto,
    summary:
      'Thống kê DO: tổng số và số DO đã giao chưa xuất hóa đơn — theo bộ lọc GET /outbound-orders trừ trạng thái, không phân trang',
  })
  getOutboundOrderStats(
    @Query() reqDto: GetOutboundOrderStatsReqDto,
  ): Promise<OutboundOrderStatsResDto> {
    return this.outboundOrdersService.getOutboundOrderStats(reqDto);
  }

  @Get('unfulfilled-order-items')
  @Permissions('outbound:read')
  @ApiAuth({
    type: UnfulfilledOrderItemResDto,
    summary:
      'Bước "Chọn PO/Job cần giao" — dòng PO còn SL chưa giao của đơn đang sản xuất, lọc theo khách hàng / PO / Job / thành phẩm / còn có thể giao',
    isPaginated: true,
  })
  getUnfulfilledOrderItems(
    @Query() reqDto: GetUnfulfilledOrderItemsReqDto,
  ): Promise<OffsetPaginatedDto<UnfulfilledOrderItemResDto>> {
    return this.outboundOrdersService.getUnfulfilledOrderItems(reqDto);
  }

  // Khai trước ':outboundOrderId' để 'export' không bị bắt nhầm thành id (như
  // 'unfulfilled-order-items' ở trên).
  @Get('export')
  @Permissions('outbound:read')
  @ApiAuth({
    summary:
      'Xuất Excel danh sách phiếu giao hàng (DO) — cùng bộ lọc GET /outbound-orders, không phân trang',
    fileType: XLSX_MIME,
  })
  exportOutboundOrders(
    @Query() reqDto: ExportOutboundOrdersReqDto,
  ): Promise<StreamableFile> {
    return this.outboundOrdersService.exportOutboundOrders(reqDto);
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
      'Lập phiếu giao hàng (DO), nhiều dòng — phase 1: luôn DRAFT, chưa duyệt, chưa sinh phiếu xuất kho, chưa đụng tồn kho',
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

  @Patch(':outboundOrderId')
  @Permissions('outbound:update')
  @ApiAuth({
    summary: 'Sửa (BUG-090) — chỉ khi DRAFT, replace-all dòng, kiểm lại E194',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateOutboundOrder(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
    @Body() reqDto: UpdateOutboundOrderReqDto,
  ): Promise<void> {
    return this.outboundOrdersService.updateOutboundOrder(
      outboundOrderId,
      reqDto,
    );
  }

  @Post(':outboundOrderId/send')
  @Permissions('outbound:update')
  @ApiAuth({
    summary:
      'Gửi duyệt (DRAFT/REJECTED → PENDING_APPROVAL) — chặn nếu còn Job nào chưa qua hết OQC hoặc có dòng vượt SL có thể giao (tồn FG − đã giữ bởi DO khác)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  sendOutboundOrder(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outboundOrdersService.sendOutboundOrder(
      outboundOrderId,
      payload.userId,
    );
  }

  @Post(':outboundOrderId/approve')
  @Permissions('outbound:approve')
  @ApiAuth({
    summary:
      'Duyệt (PENDING_APPROVAL → PENDING_DELIVERY) — kiểm lại SL vượt có thể giao (tồn FG − đã giữ bởi DO khác)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  approveOutboundOrder(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outboundOrdersService.approveOutboundOrder(
      outboundOrderId,
      payload.userId,
    );
  }

  @Post(':outboundOrderId/reject')
  @Permissions('outbound:approve')
  @ApiAuth({
    summary: 'Từ chối (PENDING_APPROVAL → REJECTED), lý do bắt buộc',
    statusCode: HttpStatus.NO_CONTENT,
  })
  rejectOutboundOrder(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
    @Body() reqDto: RejectOutboundOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outboundOrdersService.rejectOutboundOrder(
      outboundOrderId,
      reqDto,
      payload.userId,
    );
  }

  @Patch(':outboundOrderId/invoice')
  @Permissions('outbound:invoice')
  @ApiAuth({
    summary:
      'Nhập/sửa thông tin hóa đơn (số + ngày) — chỉ khi DO đã giao (E320), lưu là tự thành Đã xuất',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateOutboundOrderInvoice(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
    @Body() reqDto: UpdateOutboundOrderInvoiceReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.outboundOrdersService.updateOutboundOrderInvoice(
      outboundOrderId,
      reqDto,
      payload.userId,
    );
  }

  @Post(':outboundOrderId/cancel')
  @Permissions('outbound:update')
  @ApiAuth({
    summary:
      'Huỷ (BUG-090) — DRAFT/PENDING_APPROVAL/PENDING_DELIVERY → CANCELLED, giải phóng giữ chỗ thành phẩm',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelOutboundOrder(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
  ): Promise<void> {
    return this.outboundOrdersService.cancelOutboundOrder(outboundOrderId);
  }

  @Delete(':outboundOrderId')
  @Permissions('outbound:delete')
  @ApiAuth({
    summary: 'Xoá (BUG-090) — chỉ khi DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOutboundOrder(
    @UUIDParam('outboundOrderId') outboundOrderId: string,
  ): Promise<void> {
    return this.outboundOrdersService.deleteOutboundOrder(outboundOrderId);
  }
}
