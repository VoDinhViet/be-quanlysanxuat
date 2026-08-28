import { Exclude, Expose } from 'class-transformer';

import { EnumField, NumberField } from '../../../decorators/field.decorators';
import { ProductionJobStatus } from '../../../database/schemas';

@Exclude()
export class ProductionProgressStatusResDto {
  @Expose()
  @EnumField(() => ProductionJobStatus)
  status!: ProductionJobStatus;

  @Expose()
  @NumberField({ int: true, description: 'Số Job ở status này' })
  count!: number;

  @Expose()
  @NumberField({
    description: '% trên total, 1 chữ số thập phân; 0 khi total = 0',
  })
  percent!: number;
}
