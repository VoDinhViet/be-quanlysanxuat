import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class OverduePaymentRequestResDto {
  @Expose()
  @UUIDField({ description: 'Id yêu cầu thanh toán' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã yêu cầu thanh toán' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên nhà cung cấp' })
  supplierName!: string;

  @Expose()
  @StringField({ description: 'Hạn thanh toán (YYYY-MM-DD)' })
  dueDate!: string;

  @Expose()
  @NumberField({ int: true, description: 'Số ngày trễ so với hạn thanh toán' })
  daysOverdue!: number;

  @Expose()
  @NumberField({ description: 'Số tiền yêu cầu thanh toán' })
  requestedAmount!: number;
}
