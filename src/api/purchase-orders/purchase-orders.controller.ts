import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { PurchaseChainNotesResDto } from '../purchase-notes/dto/purchase-chain-notes.res.dto';
import { PurchaseNotesService } from '../purchase-notes/purchase-notes.service';
import { CancelPurchaseOrderReqDto } from './dto/cancel-purchase-order.req.dto';
import { CreatePurchaseOrderReqDto } from './dto/create-purchase-order.req.dto';
import { ExportPurchaseOrderPdfReqDto } from './dto/export-purchase-order-pdf.req.dto';
import { GetPurchaseOrdersReqDto } from './dto/get-purchase-orders.req.dto';
import { PagePurchaseOrderResDto } from './dto/page-purchase-order.res.dto';
import { PurchaseOrderResDto } from './dto/purchase-order.res.dto';
import { UpdatePurchaseOrderItemReqDto } from './dto/update-purchase-order-item.req.dto';
import { UpdatePurchaseOrderReqDto } from './dto/update-purchase-order.req.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@ApiTags('Purchase Orders')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly purchaseNotesService: PurchaseNotesService,
  ) {}

  @Get()
  @Permissions('purchasing:read')
  @ApiAuth({
    type: PagePurchaseOrderResDto,
    summary: 'List đơn mua (PO)',
    isPaginated: true,
  })
  getPurchaseOrders(
    @Query() reqDto: GetPurchaseOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PagePurchaseOrderResDto>> {
    return this.purchaseOrdersService.getPurchaseOrders(reqDto);
  }

  @Get(':purchaseOrderId')
  @Permissions('purchasing:read')
  @ApiAuth({
    type: PurchaseOrderResDto,
    summary: 'Chi tiết đơn mua (PO)',
  })
  getPurchaseOrder(
    @UUIDParam('purchaseOrderId') purchaseOrderId: string,
  ): Promise<PurchaseOrderResDto> {
    return this.purchaseOrdersService.getPurchaseOrder(purchaseOrderId);
  }

  @Get(':purchaseOrderId/export-pdf')
  @Permissions('purchasing:read')
  @ApiAuth({
    summary:
      'Xuất PDF đơn mua (PO) — subtotal/VAT/tổng tiền tính ở server, VAT truyền qua query',
    fileType: 'application/pdf',
  })
  exportPurchaseOrderPdf(
    @UUIDParam('purchaseOrderId') purchaseOrderId: string,
    @Query() reqDto: ExportPurchaseOrderPdfReqDto,
  ): Promise<StreamableFile> {
    return this.purchaseOrdersService.exportPurchaseOrderPdf(
      purchaseOrderId,
      reqDto.vatPercent ?? 0,
    );
  }

  @Post()
  @Permissions('purchasing:create')
  @ApiAuth({
    summary: 'Lập PO tay, không qua RFQ — chọn dòng ĐXMH đã duyệt cho một NCC',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createPurchaseOrder(
    @Body() reqDto: CreatePurchaseOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseOrdersService.createPurchaseOrder(
      reqDto,
      payload.userId,
    );
  }

  @Patch(':purchaseOrderId')
  @Permissions('purchasing:update')
  @ApiAuth({
    summary:
      'Sửa người phụ trách/điều khoản TT/kho nhập/ngày giao/ghi chú — chỉ khi DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updatePurchaseOrder(
    @UUIDParam('purchaseOrderId') purchaseOrderId: string,
    @Body() reqDto: UpdatePurchaseOrderReqDto,
  ): Promise<void> {
    return this.purchaseOrdersService.updatePurchaseOrder(
      purchaseOrderId,
      reqDto,
    );
  }

  @Patch(':purchaseOrderId/items/:purchaseOrderItemId')
  @Permissions('purchasing:update')
  @ApiAuth({
    summary: 'Sửa SL đặt/đơn giá/lý do điều chỉnh SL một dòng — chỉ khi DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updatePurchaseOrderItem(
    @UUIDParam('purchaseOrderId') purchaseOrderId: string,
    @UUIDParam('purchaseOrderItemId') purchaseOrderItemId: string,
    @Body() reqDto: UpdatePurchaseOrderItemReqDto,
  ): Promise<void> {
    return this.purchaseOrdersService.updatePurchaseOrderItem(
      purchaseOrderId,
      purchaseOrderItemId,
      reqDto,
    );
  }

  @Post(':purchaseOrderId/confirm')
  @Permissions('purchasing:update')
  @ApiAuth({
    summary: 'Xác nhận đặt hàng — DRAFT → ORDERED',
    statusCode: HttpStatus.NO_CONTENT,
  })
  confirmPurchaseOrder(
    @UUIDParam('purchaseOrderId') purchaseOrderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseOrdersService.confirmPurchaseOrder(
      purchaseOrderId,
      payload.userId,
    );
  }

  @Post(':purchaseOrderId/cancel')
  @Permissions('purchasing:approve')
  @ApiAuth({
    summary: 'Huỷ PO — DRAFT/ORDERED → CANCELLED, lý do bắt buộc',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelPurchaseOrder(
    @UUIDParam('purchaseOrderId') purchaseOrderId: string,
    @Body() reqDto: CancelPurchaseOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseOrdersService.cancelPurchaseOrder(
      purchaseOrderId,
      reqDto,
      payload.userId,
    );
  }

  @Get(':purchaseOrderId/related-notes')
  @Permissions('purchasing:read')
  @ApiAuth({
    type: PurchaseChainNotesResDto,
    summary:
      'Ghi chú gộp của toàn bộ chứng từ liên quan trong chuỗi mua hàng (ĐXMH/Báo giá/Kho)',
  })
  getRelatedNotes(
    @UUIDParam('purchaseOrderId') purchaseOrderId: string,
  ): Promise<PurchaseChainNotesResDto> {
    return this.purchaseNotesService.getChainNotesFromOrder(purchaseOrderId);
  }
}
