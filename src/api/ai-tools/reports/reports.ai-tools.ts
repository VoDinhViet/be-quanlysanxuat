import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';

import { ReportsService } from '../../reports/reports.service';
import { AiToolPermissionService } from '../core/ai-tool-permission.service';
import { formatToolResult, parseDateInput } from '../core/ai-tool.result';
import type { AiToolProvider } from '../core/ai-tool.type';
import {
  getReportProductionProgressSchema,
  getReportQualitySchema,
  getReportStatsSchema,
  type GetReportProductionProgressInput,
} from './reports.schemas';

/** Tools over the `reports` module: every one needs `reports:read`. The report DTOs are already
 * the shape the dashboard shows, so they are returned as they are. */
@Injectable()
export class ReportsAiTools implements AiToolProvider {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly toolPermission: AiToolPermissionService,
  ) {}

  getTools(): StructuredToolInterface[] {
    return [
      tool(
        this.toolPermission.withPermission('reports:read', () =>
          this.getReportStats(),
        ),
        {
          name: 'get_report_stats',
          description:
            'Tổng quan tình hình sản xuất hôm nay: số đơn đang chạy, đơn trễ hạn, đơn sắp đến hạn, job đang sản xuất, ' +
            'job chờ QC, job trễ hạn, NCR đang mở, gia công trễ, giao hàng sắp tới. ' +
            'Dùng đầu tiên khi người dùng hỏi tình hình chung hoặc cần báo cáo tổng hợp.',
          schema: getReportStatsSchema,
        },
      ),
      tool(
        this.toolPermission.withPermission(
          'reports:read',
          (input: GetReportProductionProgressInput) =>
            this.getReportProductionProgress(input),
        ),
        {
          name: 'get_report_production_progress',
          description:
            'Phân bố job theo trạng thái (chờ sản xuất, đang sản xuất, chờ QC, chờ giao, hoàn thành) kèm tỷ lệ phần trăm. ' +
            'Có thể lọc theo hạn giao của đơn hàng gốc.',
          schema: getReportProductionProgressSchema,
        },
      ),
      tool(
        this.toolPermission.withPermission('reports:read', () =>
          this.getReportQuality(),
        ),
        {
          name: 'get_report_quality',
          description:
            'Chất lượng: tỷ lệ đạt kiểm tra IQC (đầu vào) và OQC (đầu ra) theo 7 ngày gần nhất, ' +
            'cùng các NCR (không phù hợp) đang mở lâu nhất. IQC = kiểm hàng nhập, OQC = kiểm hàng xuất.',
          schema: getReportQualitySchema,
        },
      ),
    ];
  }

  private async getReportStats(): Promise<string> {
    const [stats, alerts] = await Promise.all([
      this.reportsService.getStats({}),
      this.reportsService.getAlerts(),
    ]);
    return formatToolResult({ stats, alerts });
  }

  private async getReportProductionProgress({
    dueFrom,
    dueTo,
  }: GetReportProductionProgressInput): Promise<string> {
    const progress = await this.reportsService.getProductionProgress({
      startDate: parseDateInput(dueFrom),
      endDate: parseDateInput(dueTo),
    });
    return formatToolResult(progress);
  }

  private async getReportQuality(): Promise<string> {
    const [passRates, openNcrs] = await Promise.all([
      this.reportsService.getQcPassRate(),
      this.reportsService.getOpenNcr(),
    ]);
    return formatToolResult({ passRates, openNcrs });
  }
}
