import { Exclude, Expose } from 'class-transformer';

import { ClassField, NumberField } from '../../../decorators/field.decorators';
import { ProductionProgressStatusResDto } from './production-progress-status.res.dto';

@Exclude()
export class ProductionProgressResDto {
  @Expose()
  @NumberField({ int: true, description: 'Tổng số Job' })
  total!: number;

  @Expose()
  @ClassField(() => ProductionProgressStatusResDto, {
    each: true,
    description:
      'Luôn đủ 5 phần tử theo thứ tự ProductionJobStatus, kể cả count = 0',
  })
  breakdown!: ProductionProgressStatusResDto[];
}
