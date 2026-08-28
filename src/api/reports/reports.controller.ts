import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetProductionProgressReqDto } from './dto/get-production-progress.req.dto';
import { GetReportStatsReqDto } from './dto/get-report-stats.req.dto';
import { JobDueDateResDto } from './dto/job-due-date.res.dto';
import { OpenNcrResDto } from './dto/open-ncr.res.dto';
import { OutsourcingOrderDueDateResDto } from './dto/outsourcing-order-due-date.res.dto';
import { ProductionProgressResDto } from './dto/production-progress.res.dto';
import { QcPassRateResDto } from './dto/qc-pass-rate.res.dto';
import { ReportAlertsResDto } from './dto/report-alerts.res.dto';
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

  @Get('alerts')
  @Permissions('reports:read')
  @ApiAuth({
    type: ReportAlertsResDto,
    summary:
      'Số đếm 4 cảnh báo quan trọng (Job trễ hạn, OS trễ hạn, NCR chưa xử lý, DO sắp giao) — không lọc theo ngày',
  })
  getAlerts(): Promise<ReportAlertsResDto> {
    return this.reportsService.getAlerts();
  }

  @Get('job-due-date')
  @Permissions('reports:read')
  @ApiAuth({
    type: JobDueDateResDto,
    isArray: true,
    summary:
      'Top 5 Job trễ hạn nhất (jobDueDate xa hôm nay nhất trước) cho widget "Job trễ hạn" — không phân trang, không lọc',
  })
  getJobDueDate(): Promise<JobDueDateResDto[]> {
    return this.reportsService.getJobDueDate();
  }

  @Get('outsourcing-order-due-date')
  @Permissions('reports:read')
  @ApiAuth({
    type: OutsourcingOrderDueDateResDto,
    isArray: true,
    summary:
      'Top 5 OS-OUT trễ hạn nhất (expectedReturnDate xa hôm nay nhất trước) cho widget "Gia công ngoài trễ hạn" — không phân trang, không lọc',
  })
  getOutsourcingOrderDueDate(): Promise<OutsourcingOrderDueDateResDto[]> {
    return this.reportsService.getOutsourcingOrderDueDate();
  }

  @Get('open-ncr')
  @Permissions('reports:read')
  @ApiAuth({
    type: OpenNcrResDto,
    isArray: true,
    summary:
      'Top 5 NCR chưa xử lý cũ nhất (createdAt sớm nhất trước) cho widget "NCR chưa xử lý" — không phân trang, không lọc',
  })
  getOpenNcr(): Promise<OpenNcrResDto[]> {
    return this.reportsService.getOpenNcr();
  }

  @Get('qc-pass-rate')
  @Permissions('reports:read')
  @ApiAuth({
    type: QcPassRateResDto,
    isArray: true,
    summary:
      'Tỷ lệ đạt IQC/OQC theo ngày, 7 ngày gần nhất (đủ 7 điểm, null cho ngày không có lần kiểm) cho widget "Tỷ lệ đạt QC" — không phân trang, không lọc',
  })
  getQcPassRate(): Promise<QcPassRateResDto[]> {
    return this.reportsService.getQcPassRate();
  }

  @Get('production-progress')
  @Permissions('reports:read')
  @ApiAuth({
    type: ProductionProgressResDto,
    summary:
      'Phân bố Job theo status cho donut "Tiến độ sản xuất" — luôn đủ 5 status, có thể lọc theo khoảng dueDate của đơn hàng gốc',
  })
  getProductionProgress(
    @Query() reqDto: GetProductionProgressReqDto,
  ): Promise<ProductionProgressResDto> {
    return this.reportsService.getProductionProgress(reqDto);
  }
}
