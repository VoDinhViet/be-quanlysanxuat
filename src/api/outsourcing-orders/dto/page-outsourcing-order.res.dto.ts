import { Exclude, Expose } from 'class-transformer';

import { OutsourcingOrderStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class PageOutsourcingOrderResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu gửi gia công ngoài' })
  code!: string;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @DateField({ description: 'Ngày gửi' })
  sendDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày hẹn về' })
  expectedReturnDate!: Date | null;

  @Expose()
  @EnumField(() => OutsourcingOrderStatus, {
    description: 'Trạng thái chứng từ, kiêm tiến độ nhận hàng',
  })
  status!: OutsourcingOrderStatus;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @NumberField({ description: 'Tổng SL gửi mọi dòng' })
  totalQuantity!: number;

  @Expose()
  @NumberField({ description: 'Tổng SL đã nhận mọi dòng (phiếu OS-IN POSTED)' })
  receivedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'Tổng SL còn lại chưa nhận (totalQuantity - receivedQuantity)',
  })
  remainingQuantity!: number;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
