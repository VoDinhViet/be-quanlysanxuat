import { Exclude, Expose } from 'class-transformer';

import { OutsourcingReceiptStatus } from '../../../database/schemas';
import {
  BooleanField,
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class OutsourcingReceiptResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu nhận gia công ngoài' })
  code!: string;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @DateField({ description: 'Ngày nhận' })
  receiptDate!: Date;

  @Expose()
  @BooleanField({
    description: 'Có yêu cầu QC không — sinh IQC lúc tạo nếu có',
  })
  requiresIqc!: boolean;

  @Expose()
  @EnumField(() => OutsourcingReceiptStatus)
  status!: OutsourcingReceiptStatus;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  posterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm xác nhận nhận hàng',
  })
  postedAt!: Date | null;
}
