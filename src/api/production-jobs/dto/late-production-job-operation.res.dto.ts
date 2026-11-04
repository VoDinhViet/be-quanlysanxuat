import { Exclude, Expose } from 'class-transformer';

import { NumberField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class LateProductionJobOperationResDto {
  @Expose()
  @StringField({ description: 'Mã đơn bán (SO)' })
  orderCode!: string;

  @Expose()
  @StringField({ description: 'Mã JOB' })
  jobCode!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn' })
  operationName!: string;

  @Expose()
  @StringField({ description: 'Hạn hoàn thành công đoạn (YYYY-MM-DD)' })
  dueDate!: string;

  @Expose()
  @NumberField({ description: 'Số ngày trễ so với hôm nay', int: true })
  daysOverdue!: number;

  @Expose()
  @NumberField({ description: 'Số lượng công đoạn đã làm' })
  completedQuantity!: number;

  @Expose()
  @NumberField({ description: 'Số lượng cần làm của JOB' })
  jobQuantity!: number;
}
