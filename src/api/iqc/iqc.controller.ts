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
import { XLSX_MIME } from '../../common/utils/excel';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { ConfirmIqcReqDto } from './dto/confirm-iqc.req.dto';
import { CreateIqcReqDto } from './dto/create-iqc.req.dto';
import { ExportIqcReqDto } from './dto/export-iqc.req.dto';
import { GetIqcInspectionRateReqDto } from './dto/get-iqc-inspection-rate.req.dto';
import { GetIqcSupplierFailRateReqDto } from './dto/get-iqc-supplier-fail-rate.req.dto';
import { GetIqcsReqDto } from './dto/get-iqcs.req.dto';
import { GetOpenIqcFailuresReqDto } from './dto/get-open-iqc-failures.req.dto';
import { IqcResDto } from './dto/iqc.res.dto';
import { IqcInspectionRateResDto } from './dto/iqc-inspection-rate.res.dto';
import { IqcStatsResDto } from './dto/iqc-stats.res.dto';
import { IqcSupplierFailRateResDto } from './dto/iqc-supplier-fail-rate.res.dto';
import { OpenIqcFailureResDto } from './dto/open-iqc-failure.res.dto';
import { PageIqcResDto } from './dto/page-iqc.res.dto';
import { UpdateIqcReqDto } from './dto/update-iqc.req.dto';
import { IqcService } from './iqc.service';
import { IqcSummaryService } from './iqc-summary.service';

@ApiTags('IQC')
@Controller('iqc')
export class IqcController {
  constructor(
    private readonly iqcService: IqcService,
    private readonly iqcSummaryService: IqcSummaryService,
  ) {}

  @Get()
  @Permissions('iqc:read')
  @ApiAuth({
    type: PageIqcResDto,
    summary: 'List phiếu IQC',
    isPaginated: true,
  })
  getIqcs(
    @Query() reqDto: GetIqcsReqDto,
  ): Promise<OffsetPaginatedDto<PageIqcResDto>> {
    return this.iqcService.getIqcs(reqDto);
  }

  // Khai trước ':iqcId' để 'stats' không bị bắt nhầm thành id — cùng khuôn `orders.controller.ts`.
  @Get('stats')
  @Permissions('iqc:read')
  @ApiAuth({
    type: IqcStatsResDto,
    summary:
      'Thống kê IQC (tổng / chưa kiểm / PASS / FAIL / chờ xử lý / chờ trả NCC / hoàn thành)',
  })
  getIqcStats(): Promise<IqcStatsResDto> {
    return this.iqcService.getIqcStats();
  }

  // Ba route thống kê dưới đây khai trước ':iqcId' để không bị bắt nhầm thành id.
  @Get('inspection-rate')
  @Permissions('iqc:read')
  @ApiAuth({
    type: IqcInspectionRateResDto,
    isArray: true,
    summary:
      'Completed IQC inspections by result (pass, fail), grouped by result, day or supplier',
  })
  getIqcInspectionRate(
    @Query() reqDto: GetIqcInspectionRateReqDto,
  ): Promise<IqcInspectionRateResDto[]> {
    return this.iqcSummaryService.getInspectionRate(reqDto);
  }

  @Get('supplier-fail-rate')
  @Permissions('iqc:read')
  @ApiAuth({
    type: IqcSupplierFailRateResDto,
    isArray: true,
    summary:
      'IQC fail rate per supplier, only suppliers with at least one failure, highest rate first',
  })
  getIqcSupplierFailRate(
    @Query() reqDto: GetIqcSupplierFailRateReqDto,
  ): Promise<IqcSupplierFailRateResDto[]> {
    return this.iqcSummaryService.getSupplierFailRate(reqDto);
  }

  @Get('open-failures')
  @Permissions('iqc:read')
  @ApiAuth({
    type: OpenIqcFailureResDto,
    isArray: true,
    summary:
      'Failed IQC inspections still open (not completed, or completed without a disposition), oldest first',
  })
  getOpenIqcFailures(
    @Query() reqDto: GetOpenIqcFailuresReqDto,
  ): Promise<OpenIqcFailureResDto[]> {
    return this.iqcSummaryService.getOpenIqcFailures(reqDto);
  }

  // Khai trước ':iqcId' để 'export' không bị bắt nhầm thành id — cùng lý do 'stats' ở trên.
  @Get('export')
  @Permissions('iqc:read')
  @ApiAuth({
    summary:
      'Xuất Excel danh sách IQC — cùng bộ lọc GET /iqc, không phân trang',
    fileType: XLSX_MIME,
  })
  exportIqc(@Query() reqDto: ExportIqcReqDto): Promise<StreamableFile> {
    return this.iqcService.exportIqc(reqDto);
  }

  @Get(':iqcId')
  @Permissions('iqc:read')
  @ApiAuth({
    type: IqcResDto,
    summary: 'Chi tiết phiếu IQC',
  })
  getIqc(@UUIDParam('iqcId') iqcId: string): Promise<IqcResDto> {
    return this.iqcService.getIqc(iqcId);
  }

  @Post()
  @Permissions('iqc:create')
  @ApiAuth({
    summary: 'Tạo phiếu IQC',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createIqc(
    @Body() reqDto: CreateIqcReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.iqcService.createIqc(reqDto, payload.userId);
  }

  @Post(':iqcId/confirm')
  @Permissions('iqc:update')
  @ApiAuth({
    summary:
      'Lưu kết quả kiểm QC (nút "Lưu" duy nhất của trang chi tiết IQC) — QC tự chọn PASS/FAIL, ' +
      'ghi đè toàn bộ quyết định mỗi lần gọi, gọi lại được nhiều lần trừ khi đã WAITING_RETURN',
    statusCode: HttpStatus.NO_CONTENT,
  })
  confirmIqc(
    @UUIDParam('iqcId') iqcId: string,
    @Body() reqDto: ConfirmIqcReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.iqcService.confirmIqc(iqcId, reqDto, payload.userId);
  }

  @Patch(':iqcId')
  @Permissions('iqc:update')
  @ApiAuth({
    summary:
      'Sửa lại thông tin ngữ cảnh (tiêu chuẩn kiểm/người kiểm tra/ngày kiểm tra/dụng cụ đo) — chỉ khi đã confirm',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateIqc(
    @UUIDParam('iqcId') iqcId: string,
    @Body() reqDto: UpdateIqcReqDto,
  ): Promise<void> {
    return this.iqcService.updateIqc(iqcId, reqDto);
  }

  @Delete(':iqcId')
  @Permissions('iqc:delete')
  @ApiAuth({
    summary: 'Xoá phiếu IQC — chỉ khi còn NOT_INSPECTED',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteIqc(@UUIDParam('iqcId') iqcId: string): Promise<void> {
    return this.iqcService.deleteIqc(iqcId);
  }
}
