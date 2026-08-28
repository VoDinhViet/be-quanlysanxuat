import { Exclude, Expose } from 'class-transformer';

import {
  DateField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class OutsourcingOrderDueDateResDto {
  @Expose()
  @UUIDField({ description: 'OS-OUT id' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu OS-OUT' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên NCC' })
  supplierName!: string;

  @Expose()
  @DateField({ description: 'Ngày hẹn nhận về (expectedReturnDate)' })
  expectedReturnDate!: Date;
}
