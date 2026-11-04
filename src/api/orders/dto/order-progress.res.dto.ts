import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class OrderProgressResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã đơn hàng bán (SO)' })
  code!: string;

  @Expose()
  @StringField()
  clientName!: string;

  @Expose()
  @StringField()
  status!: string;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Hạn giao (YYYY-MM-DD)' })
  dueDate!: string | null;

  @Expose()
  @NumberField({ int: true, description: 'Số JOB của đơn' })
  jobCount!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số JOB đã COMPLETED' })
  completedJobCount!: number;
}
