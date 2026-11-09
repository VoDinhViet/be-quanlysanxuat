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
import { GetSupplierReturnSummaryReqDto } from './dto/get-supplier-return-summary.req.dto';
import { GetSupplierReturnsReqDto } from './dto/get-supplier-returns.req.dto';
import { PageSupplierReturnResDto } from './dto/page-supplier-return.res.dto';
import { PostSupplierReturnReqDto } from './dto/post-supplier-return.req.dto';
import { SupplierReturnResDto } from './dto/supplier-return.res.dto';
import { SupplierReturnSummaryResDto } from './dto/supplier-return-summary.res.dto';
import { UpdateSupplierReturnReqDto } from './dto/update-supplier-return.req.dto';
import { SupplierReturnPdfService } from './supplier-return-pdf.service';
import { SupplierReturnsService } from './supplier-returns.service';
import { SupplierReturnsSummaryService } from './supplier-returns-summary.service';

@ApiTags('Supplier Returns')
@Controller('supplier-returns')
export class SupplierReturnsController {
  constructor(
    private readonly supplierReturnsService: SupplierReturnsService,
    private readonly supplierReturnsSummaryService: SupplierReturnsSummaryService,
    private readonly supplierReturnPdfService: SupplierReturnPdfService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: PageSupplierReturnResDto,
    summary: 'List phiếu trả NCC',
    isPaginated: true,
  })
  getSupplierReturns(
    @Query() reqDto: GetSupplierReturnsReqDto,
  ): Promise<OffsetPaginatedDto<PageSupplierReturnResDto>> {
    return this.supplierReturnsService.getSupplierReturns(reqDto);
  }

  // Khai trước ':supplierReturnId' để 'summary' không bị bắt nhầm thành id.
  @Get('summary')
  @Permissions('inventory:read')
  @ApiAuth({
    type: SupplierReturnSummaryResDto,
    isArray: true,
    summary:
      'Supplier return count and quantity grouped by status or by supplier, optionally within a return date range',
  })
  getSupplierReturnSummary(
    @Query() reqDto: GetSupplierReturnSummaryReqDto,
  ): Promise<SupplierReturnSummaryResDto[]> {
    return this.supplierReturnsSummaryService.getSummary(reqDto);
  }

  @Get(':supplierReturnId')
  @Permissions('inventory:read')
  @ApiAuth({
    type: SupplierReturnResDto,
    summary: 'Get supplier return detail',
  })
  getSupplierReturn(
    @UUIDParam('supplierReturnId') supplierReturnId: string,
  ): Promise<SupplierReturnResDto> {
    return this.supplierReturnsService.getSupplierReturn(supplierReturnId);
  }

  @Get(':supplierReturnId/export-pdf')
  @Permissions('inventory:read')
  @ApiAuth({
    summary: 'Xuất PDF Phiếu xuất trả nhà cung cấp (BM 09-08)',
    fileType: 'application/pdf',
  })
  exportSupplierReturnPdf(
    @UUIDParam('supplierReturnId') supplierReturnId: string,
  ): Promise<StreamableFile> {
    return this.supplierReturnPdfService.exportSupplierReturnPdf(
      supplierReturnId,
    );
  }

  @Patch(':supplierReturnId')
  @Permissions('inventory:update')
  @ApiAuth({
    type: SupplierReturnResDto,
    summary:
      'Cập nhật lý do trả hàng / ghi chú của phiếu trả NCC (chỉ khi DRAFT)',
  })
  updateSupplierReturn(
    @UUIDParam('supplierReturnId') supplierReturnId: string,
    @Body() reqDto: UpdateSupplierReturnReqDto,
  ): Promise<SupplierReturnResDto> {
    return this.supplierReturnsService.updateSupplierReturn(
      supplierReturnId,
      reqDto,
    );
  }

  @Post(':supplierReturnId/post')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Xác nhận xuất trả NCC (DRAFT → POSTED) — trừ tồn (nếu phiếu nhập gốc đã POSTED) và hoàn ' +
      'tất luôn phiếu IQC liên kết',
    statusCode: HttpStatus.NO_CONTENT,
  })
  postSupplierReturn(
    @UUIDParam('supplierReturnId') supplierReturnId: string,
    @Body() reqDto: PostSupplierReturnReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.supplierReturnsService.postSupplierReturn(
      supplierReturnId,
      reqDto,
      payload.userId,
    );
  }
}
