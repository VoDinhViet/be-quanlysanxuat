import { PickType } from '@nestjs/swagger';

import { GetProductionJobsReqDto } from './get-production-jobs.req.dto';

export class GetProductionJobStatsReqDto extends PickType(
  GetProductionJobsReqDto,
  ['q', 'orderId', 'itemId', 'clientId', 'startDate', 'endDate'] as const,
) {}
