import { DateRangeLimitReqDto } from '../../../common/summary/summary.dto';
import { ProductionJobStatus } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetProductionJobItemSummaryReqDto extends DateRangeLimitReqDto {
  @EnumFieldOptional(() => ProductionJobStatus, {
    description: 'Chỉ JOB ở trạng thái này, mặc định COMPLETED',
  })
  readonly status?: ProductionJobStatus;
}
