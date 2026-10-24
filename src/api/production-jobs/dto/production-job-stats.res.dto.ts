import { Exclude, Expose } from 'class-transformer';

import { NumberField } from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobStatsResDto {
  @Expose()
  @NumberField({ int: true, description: 'Tổng số Job khớp bộ lọc' })
  total!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số Job PENDING' })
  pending!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số Job IN_PROGRESS' })
  inProgress!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số Job WAITING_QC' })
  waitingQc!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số Job WAITING_DELIVERY' })
  waitingDelivery!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số Job COMPLETED' })
  completed!: number;
}
