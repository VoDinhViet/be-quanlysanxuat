import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  DateFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { QuotationItemSupplierLastPurchaseResDto } from './quotation-item-supplier-last-purchase.res.dto';

@Exclude()
export class QuotationItemSupplierResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Đơn giá NCC báo' })
  unitPrice!: number | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    int: true,
    description: 'Thời gian giao hàng (ngày)',
  })
  leadTimeDays!: number | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => QuotationItemSupplierLastPurchaseResDto, {
    nullable: true,
    description:
      'Giá + ngày lần đặt mua gần nhất của đúng vật tư này với NCC này',
  })
  lastPurchase!: QuotationItemSupplierLastPurchaseResDto | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  selectorBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Thời điểm thắng thầu' })
  selectedAt!: Date | null;
}
