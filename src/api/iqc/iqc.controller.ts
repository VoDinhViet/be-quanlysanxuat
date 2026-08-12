import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateIqcReqDto } from './dto/create-iqc.req.dto';
import { GetIqcsReqDto } from './dto/get-iqcs.req.dto';
import { IqcResDto } from './dto/iqc.res.dto';
import { IqcStatsResDto } from './dto/iqc-stats.res.dto';
import { PageIqcResDto } from './dto/page-iqc.res.dto';
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

  // Khai trước ':iqcId' (chưa có ở module này, nhưng giữ đúng khuôn `orders.controller.ts`) để
  // 'stats' không bị bắt nhầm thành id.
  @Get('stats')
  @Permissions('iqc:read')
  @ApiAuth({
    type: IqcStatsResDto,
    summary:
      'Thống kê IQC (tổng / PASS / FAIL / chờ xử lý / chờ trả NCC / hoàn thành)',
  })
  getIqcStats(): Promise<IqcStatsResDto> {
    return this.iqcService.getIqcStats();
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
}
