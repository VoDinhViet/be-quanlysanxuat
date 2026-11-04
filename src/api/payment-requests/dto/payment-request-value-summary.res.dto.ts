import { Exclude, Expose } from 'class-transformer';

import { NumberField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class PaymentRequestValueSummaryResDto {
  @Expose()
  @StringField({ description: 'Trạng thái yêu cầu thanh toán' })
  status!: string;

  @Expose()
  @NumberField({ int: true, description: 'Số yêu cầu thanh toán' })
  requestCount!: number;

  @Expose()
  @NumberField({ description: 'Tổng số tiền yêu cầu thanh toán' })
  totalValue!: number;
}
