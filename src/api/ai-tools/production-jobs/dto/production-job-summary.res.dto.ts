import { PickType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { ClientRefResDto } from '../../../clients/dto/client-ref.res.dto';
import { ProductionJobResDto } from '../../../production-jobs/dto/production-job.res.dto';

/** What the model sees for one job. `client` is narrowed to id/code/name, as in the order summary. */
@Exclude()
export class ProductionJobSummaryResDto extends PickType(ProductionJobResDto, [
  'code',
  'orderCode',
  'buyerPoNo',
  'item',
  'quantity',
  'dueDate',
  'status',
] as const) {
  @Expose()
  @Type(() => ClientRefResDto)
  client!: ClientRefResDto | null;
}
