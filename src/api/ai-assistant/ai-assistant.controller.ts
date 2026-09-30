import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../../decorators/public.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { JobDueDateResDto } from '../reports/dto/job-due-date.res.dto';
import { OpenNcrResDto } from '../reports/dto/open-ncr.res.dto';
import { OutsourcingOrderDueDateResDto } from '../reports/dto/outsourcing-order-due-date.res.dto';
import { ProductionProgressResDto } from '../reports/dto/production-progress.res.dto';
import { QcPassRateResDto } from '../reports/dto/qc-pass-rate.res.dto';
import { ReportAlertsResDto } from '../reports/dto/report-alerts.res.dto';
import { AiAssistantService } from './ai-assistant.service';
import { TrackJobResDto } from './dto/track-job.res.dto';

@ApiTags('AI-Tools')
@Public()
@Controller('ai-assistant/tools')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get()
  getToolsDirectory() {
    return {
      message: 'AI Assistant Tools API Directory',
      tools: [
        {
          name: 'factory-alerts',
          endpoint: '/api/ai-assistant/tools/factory-alerts',
          description:
            'Lấy 4 chỉ số cảnh báo nóng của nhà máy: Job trễ, OS trễ, NCR chưa đóng, DO sắp đến hạn',
        },
        {
          name: 'production-overview',
          endpoint: '/api/ai-assistant/tools/production-overview',
          description: 'Lấy tổng quan phân bố tiến độ các lệnh sản xuất trong xưởng',
        },
        {
          name: 'delayed-jobs',
          endpoint: '/api/ai-assistant/tools/delayed-jobs',
          description: 'Lấy danh sách các lệnh sản xuất (Job) đang bị trễ hạn cần xử lý gấp',
        },
        {
          name: 'qc-summary',
          endpoint: '/api/ai-assistant/tools/qc-summary',
          description: 'Lấy dữ liệu tỷ lệ đạt chất lượng IQC (vật tư) và OQC (thành phẩm)',
        },
        {
          name: 'open-ncr',
          endpoint: '/api/ai-assistant/tools/open-ncr',
          description: 'Lấy danh sách các sự cố không phù hợp (NCR) chưa được giải quyết',
        },
        {
          name: 'outsourcing-delayed',
          endpoint: '/api/ai-assistant/tools/outsourcing-delayed',
          description: 'Lấy danh sách các đơn giao gia công ngoài đang bị trễ hạn trả hàng',
        },
        {
          name: 'track-job',
          endpoint: '/api/ai-assistant/tools/track-job/:code',
          description:
            'Tra cứu chi tiết tiến độ theo mã Lệnh sản xuất (Job) hoặc Mã Đơn Hàng',
        },
        {
          name: 'pending-po',
          endpoint: '/api/ai-assistant/tools/pending-po',
          description:
            'Lấy danh sách các đơn mua hàng (PO) vật tư đang chờ nhà cung cấp giao về nhà máy',
        },
        {
          name: 'inventory-stock',
          endpoint: '/api/ai-assistant/tools/stock/:code',
          description:
            'Tra cứu số lượng tồn kho khả dụng của mã vật tư hoặc thành phẩm',
        },
        {
          name: 'upcoming-deliveries',
          endpoint: '/api/ai-assistant/tools/upcoming-deliveries',
          description:
            'Lấy danh sách các đợt xuất hàng giao khách (DO) sắp đến hạn trong 7 ngày tới',
        },
        {
          name: 'bottlenecks',
          endpoint: '/api/ai-assistant/tools/bottlenecks',
          description:
            'Thống kê top các công đoạn đang ứ đọng nhiều bán thành phẩm (WIP) nhất trong xưởng',
        },
      ],
    };
  }

  @Get('factory-alerts')
  @Permissions('reports:read')
  @ApiAuth({
    type: ReportAlertsResDto,
    summary: '[AI-Tool] Lấy con số 4 cảnh báo nóng nhà máy: Job trễ, OS trễ, NCR chưa đóng, DO sắp giao',
  })
  getFactoryAlerts(): Promise<ReportAlertsResDto> {
    return this.aiAssistantService.getFactoryAlertsSummary();
  }

  @Get('production-overview')
  @Permissions('reports:read')
  @ApiAuth({
    type: ProductionProgressResDto,
    summary: '[AI-Tool] Lấy tổng quan phân bố tiến độ các lệnh sản xuất trong xưởng',
  })
  getProductionOverview(
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ): Promise<ProductionProgressResDto> {
    return this.aiAssistantService.getProductionOverview(startDate, endDate);
  }

  @Get('delayed-jobs')
  @Permissions('reports:read')
  @ApiAuth({
    type: JobDueDateResDto,
    isArray: true,
    summary: '[AI-Tool] Lấy danh sách các lệnh sản xuất (Job) đang bị trễ hạn cần xử lý gấp',
  })
  getDelayedJobs(): Promise<JobDueDateResDto[]> {
    return this.aiAssistantService.getDelayedJobs();
  }

  @Get('qc-summary')
  @Permissions('reports:read')
  @ApiAuth({
    type: QcPassRateResDto,
    isArray: true,
    summary: '[AI-Tool] Lấy dữ liệu tỷ lệ đạt chất lượng IQC (vật tư) và OQC (thành phẩm)',
  })
  getQcSummary(): Promise<QcPassRateResDto[]> {
    return this.aiAssistantService.getQcSummary();
  }

  @Get('open-ncr')
  @Permissions('reports:read')
  @ApiAuth({
    type: OpenNcrResDto,
    isArray: true,
    summary: '[AI-Tool] Lấy danh sách các sự cố không phù hợp (NCR) chưa được giải quyết',
  })
  getOpenNcr(): Promise<OpenNcrResDto[]> {
    return this.aiAssistantService.getOpenNcr();
  }

  @Get('outsourcing-delayed')
  @Permissions('reports:read')
  @ApiAuth({
    type: OutsourcingOrderDueDateResDto,
    isArray: true,
    summary: '[AI-Tool] Lấy danh sách các đơn giao gia công ngoài đang bị trễ hạn trả hàng',
  })
  getOutsourcingDelayed(): Promise<OutsourcingOrderDueDateResDto[]> {
    return this.aiAssistantService.getOutsourcingDelayed();
  }

  @Get('track-job/:code')
  @Permissions('reports:read')
  @ApiAuth({
    type: TrackJobResDto,
    summary:
      '[AI-Tool] Tra cứu chi tiết tiến độ theo mã Lệnh sản xuất (Job) hoặc Mã Đơn Hàng',
  })
  trackJob(@Param('code') code: string): Promise<TrackJobResDto> {
    return this.aiAssistantService.trackJobOrOrder(code);
  }

  @Get('pending-po')
  @Permissions('reports:read')
  @ApiAuth({
    summary:
      '[AI-Tool] Lấy danh sách các đơn mua hàng (PO) vật tư đang chờ nhà cung cấp giao về nhà máy',
  })
  getPendingPurchaseOrders() {
    return this.aiAssistantService.getPendingPurchaseOrders();
  }

  @Get('stock/:code')
  @Permissions('reports:read')
  @ApiAuth({
    summary:
      '[AI-Tool] Tra cứu số lượng tồn kho khả dụng của mã vật tư hoặc thành phẩm',
  })
  getInventoryStockByCode(@Param('code') code: string) {
    return this.aiAssistantService.getInventoryStock(code);
  }

  @Get('stock')
  @Permissions('reports:read')
  @ApiAuth({
    summary: '[AI-Tool] Lấy danh sách tồn kho các mặt hàng chính',
  })
  getInventoryStock() {
    return this.aiAssistantService.getInventoryStock();
  }

  @Get('upcoming-deliveries')
  @Permissions('reports:read')
  @ApiAuth({
    summary:
      '[AI-Tool] Lấy danh sách các đợt xuất hàng giao khách (DO) sắp đến hạn trong 7 ngày tới',
  })
  getUpcomingDeliveries(@Query('days') days?: string) {
    return this.aiAssistantService.getUpcomingDeliveries(
      days ? Number(days) : 7,
    );
  }

  @Get('bottlenecks')
  @Permissions('reports:read')
  @ApiAuth({
    summary:
      '[AI-Tool] Thống kê top các công đoạn đang ứ đọng nhiều bán thành phẩm (WIP) nhất trong xưởng',
  })
  getOperationBottlenecks() {
    return this.aiAssistantService.getOperationBottlenecks();
  }
}
