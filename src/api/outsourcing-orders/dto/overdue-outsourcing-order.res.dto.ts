import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class OverdueOutsourcingOrderResDto {
  @Expose()
  @UUIDField({ description: 'Id phiếu gửi gia công ngoài' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu gửi gia công ngoài (OS-OUT)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên nhà cung cấp' })
  supplierName!: string;

  @Expose()
  @StringField({ description: 'Ngày hẹn trả (YYYY-MM-DD)' })
  expectedReturnDate!: string;

  @Expose()
  @NumberField({ description: 'Số ngày trễ so với hôm nay', int: true })
  daysOverdue!: number;

  @Expose()
  @StringField({ description: 'Trạng thái phiếu: SENT, PARTIAL, WAITING_QC' })
  status!: string;
}
