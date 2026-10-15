import { Exclude, Expose } from 'class-transformer';

import { OutsourcingOrderStatus } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

// Khai riêng thay vì `PickType(OutsourcingOrderResDto, ...)`: DTO dòng OS-IN
// (`OutsourcingReceiptItemResDto`, `PendingOrderItemResDto`) nhúng ref này, chỉ cần vài field.
@Exclude()
export class OutsourcingOrderRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu gửi gia công ngoài' })
  code!: string;

  @Expose()
  @EnumField(() => OutsourcingOrderStatus)
  status!: OutsourcingOrderStatus;

  @Expose()
  @DateField({ description: 'Ngày gửi' })
  sendDate!: Date;
}
