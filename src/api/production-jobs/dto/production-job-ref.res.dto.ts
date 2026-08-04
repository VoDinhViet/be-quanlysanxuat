import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { ProductionJobResDto } from './production-job.res.dto';

@Exclude()
export class ProductionJobRefResDto extends PickType(ProductionJobResDto, [
  'id',
  'code',
] as const) {}
