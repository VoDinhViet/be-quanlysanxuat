import { ProductionJobStatus } from '../../../database/schemas';
import { GetProductionJobsReqDto } from '../../production-jobs/dto/get-production-jobs.req.dto';
import { ProductionJobsService } from '../../production-jobs/production-jobs.service';
import {
  clampLimit,
  createRequestDto,
  getVietnamDate,
} from '../core/ai-tool.result';

const UNFINISHED_JOB_STATUSES = [
  ProductionJobStatus.PENDING,
  ProductionJobStatus.IN_PROGRESS,
  ProductionJobStatus.WAITING_QC,
  ProductionJobStatus.WAITING_DELIVERY,
];

/** A job is overdue when its source order's due date has passed and it is not completed. */
export function findOverdueProductionJobs(
  productionJobsService: ProductionJobsService,
  limit: number | undefined,
) {
  return productionJobsService.getProductionJobs(
    createRequestDto(GetProductionJobsReqDto, {
      limit: clampLimit(limit),
      statuses: UNFINISHED_JOB_STATUSES,
      endDate: getVietnamDate(-1),
    }),
  );
}
