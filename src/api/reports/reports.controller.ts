import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetReportStatsReqDto } from './dto/get-report-stats.req.dto';
import { ReportStatsResDto } from './dto/report-stats.res.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('stats')
  @Permissions('reports:read')
  @ApiAuth({
    type: ReportStatsResDto,
    summary:
      'KPI tổng quan nhà máy (đơn hàng/sản xuất/QC) cho trang Bảng điều khiển — có thể lọc theo khoảng ngày',
  })
  getStats(@Query() reqDto: GetReportStatsReqDto): Promise<ReportStatsResDto> {
    return this.reportsService.getStats(reqDto);
  }
}
