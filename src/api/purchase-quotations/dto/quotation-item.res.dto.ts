import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  DateFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { PurchaseRequestItemRefResDto } from '../../purchase-requests/dto/purchase-request-item-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class QuotationItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @NumberField({ description: 'SL hỏi giá' })
  quantity!: number;

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
  @ClassField(() => PurchaseRequestItemRefResDto)
  purchaseRequestItem!: PurchaseRequestItemRefResDto;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  selectorBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Thời điểm chốt giá' })
  selectedAt!: Date | null;
}
