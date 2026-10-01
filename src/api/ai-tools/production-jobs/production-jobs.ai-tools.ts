import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';

import { ProductionJobsService } from '../../production-jobs/production-jobs.service';
import { AiToolPermissionService } from '../core/ai-tool-permission.service';
import { formatListResult, serializeToolRows } from '../core/ai-tool.result';
import type { AiToolProvider } from '../core/ai-tool.type';
import { ProductionJobSummaryResDto } from './dto/production-job-summary.res.dto';
import { findOverdueProductionJobs } from './production-jobs.queries';
import {
  listOverdueProductionJobsSchema,
  type ListOverdueProductionJobsInput,
} from './production-jobs.schemas';

@Injectable()
export class ProductionJobsAiTools implements AiToolProvider {
  constructor(
    private readonly productionJobsService: ProductionJobsService,
    private readonly toolPermission: AiToolPermissionService,
  ) {}

  getTools(): StructuredToolInterface[] {
    return [
      tool(
        this.toolPermission.withPermission(
          'production:read',
          (input: ListOverdueProductionJobsInput) =>
            this.listOverdueProductionJobs(input),
        ),
        {
          name: 'list_overdue_production_jobs',
          description:
            'Danh sách job (lệnh sản xuất con) đã trễ hạn: hạn giao của đơn hàng gốc đã qua nhưng job chưa hoàn thành. ' +
            'Dùng khi hỏi job nào trễ, vì sao chậm tiến độ.',
          schema: listOverdueProductionJobsSchema,
        },
      ),
    ];
  }

  private async listOverdueProductionJobs({
    limit,
  }: ListOverdueProductionJobsInput): Promise<string> {
    const page = await findOverdueProductionJobs(
      this.productionJobsService,
      limit,
    );
    return formatListResult({
      rows: serializeToolRows(ProductionJobSummaryResDto, page.data),
      total: page.pagination.totalRecords,
    });
  }
}
