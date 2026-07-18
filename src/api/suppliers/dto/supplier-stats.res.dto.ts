import { Exclude, Expose } from 'class-transformer';

import { NumberField } from '../../../decorators/field.decorators';

@Exclude()
export class SupplierStatsResDto {
  @Expose()
  @NumberField({ description: 'Total number of suppliers', int: true })
  total!: number;

  @Expose()
  @NumberField({ description: 'Number of active suppliers', int: true })
  active!: number;

  @Expose()
  @NumberField({ description: 'Number of paused suppliers', int: true })
  paused!: number;

  @Expose()
  @NumberField({ description: 'Number of stopped suppliers', int: true })
  stopped!: number;
}
