import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class PendingDeliveryOutboundOrderResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu giao hàng (DO)' })
  code!: string;

  @Expose()
  @StringField()
  clientName!: string;

  @Expose()
  @StringField({ description: 'Ngày giao dự kiến (YYYY-MM-DD)' })
  fulfillmentDate!: string;

  @Expose()
  @NumberField({
    int: true,
    description: 'Số ngày còn lại đến ngày giao; âm là đã quá hạn',
  })
  daysRemaining!: number;
}
