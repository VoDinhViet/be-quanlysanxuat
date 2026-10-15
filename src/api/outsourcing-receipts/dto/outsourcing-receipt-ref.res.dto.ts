import { Exclude, Expose } from 'class-transformer';

import { OutsourcingReceiptStatus } from '../../../database/schemas';
import {
  BooleanField,
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

// Khai riêng thay vì `PickType(OutsourcingReceiptResDto, ...)`: `iqc` và `supplier-returns` nhúng
// ref này, không cần kéo theo DTO phiếu đầy đủ.
@Exclude()
export class OutsourcingReceiptRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu nhận gia công ngoài' })
  code!: string;

  @Expose()
  @EnumField(() => OutsourcingReceiptStatus)
  status!: OutsourcingReceiptStatus;

  @Expose()
  @DateField({ description: 'Ngày nhận' })
  receiptDate!: Date;

  @Expose()
  @BooleanField({ description: 'Có yêu cầu QC không' })
  requiresIqc!: boolean;
}
