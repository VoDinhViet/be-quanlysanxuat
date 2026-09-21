import { Exclude, Expose } from 'class-transformer';

import { ProductionJobStatus } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class JobDueDateResDto {
  @Expose()
  @UUIDField({ description: 'Job id — dùng cho GET /production-jobs/:jobId' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã Job' })
  code!: string;

  @Expose()
  @StringField({ description: 'Mã đơn hàng (PO)' })
  orderCode!: string;

  @Expose()
  @DateField({ description: 'jobDueDate — orders.dueDate của đơn hàng gốc' })
  dueDate!: Date;

  @Expose()
  @EnumField(() => ProductionJobStatus, { description: 'Trạng thái Job' })
  status!: ProductionJobStatus;
}
