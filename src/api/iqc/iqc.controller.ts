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
import { ConfirmIqcReqDto } from './dto/confirm-iqc.req.dto';
import { CreateIqcReqDto } from './dto/create-iqc.req.dto';
import { GetIqcsReqDto } from './dto/get-iqcs.req.dto';
import { IqcResDto } from './dto/iqc.res.dto';
import { IqcStatsResDto } from './dto/iqc-stats.res.dto';
import { PageIqcResDto } from './dto/page-iqc.res.dto';
import { ResolveIqcReqDto } from './dto/resolve-iqc.req.dto';
import { UpdateIqcReqDto } from './dto/update-iqc.req.dto';
import { IqcService } from './iqc.service';

@ApiTags('IQC')
@Controller('iqc')
export class IqcController {
  constructor(private readonly iqcService: IqcService) {}

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
    type: IqcResDto,
    summary: 'Tạo phiếu IQC',
    statusCode: HttpStatus.CREATED,
  })
  createIqc(
    @Body() reqDto: CreateIqcReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<IqcResDto> {
    return this.iqcService.createIqc(reqDto, payload.userId);
  }

  @Post(':iqcId/confirm')
  @Permissions('iqc:update')
  @ApiAuth({
    summary:
      'Xác nhận QC — chạy AQL sampling, chốt PASS/FAIL — chỉ khi NOT_INSPECTED',
    statusCode: HttpStatus.NO_CONTENT,
  })
  confirmIqc(
    @UUIDParam('iqcId') iqcId: string,
    @Body() reqDto: ConfirmIqcReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.iqcService.confirmIqc(iqcId, reqDto, payload.userId);
  }

  @Post(':iqcId/resolve')
  @Permissions('iqc:update')
  @ApiAuth({
    summary:
      'Xử lý QC FAIL — chọn phương án xử lý (disposition) cho dòng đang Chờ xử lý',
    statusCode: HttpStatus.NO_CONTENT,
  })
  resolveIqcDisposition(
    @UUIDParam('iqcId') iqcId: string,
    @Body() reqDto: ResolveIqcReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.iqcService.resolveIqcDisposition(iqcId, reqDto, payload.userId);
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
}
