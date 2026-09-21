import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { ProductionJobOperationResDto } from './production-job-operation.res.dto';

@Exclude()
export class ProductionJobOperationRefResDto extends PickType(
  ProductionJobOperationResDto,
  ['code', 'name'] as const,
) {}
