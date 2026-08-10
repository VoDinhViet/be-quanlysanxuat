import { Exclude, Expose } from 'class-transformer';

import { PurchaseOrderStatus } from '../../../database/schemas';
import {
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
import { PagePurchaseOrderItemResDto } from './page-purchase-order-item.res.dto';

@Exclude()
export class PagePurchaseOrderResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã đơn mua' })
  code!: string;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @EnumField(() => PurchaseOrderStatus)
  status!: PurchaseOrderStatus;

  @Expose()
  @DateField({ description: 'Ngày đặt mua' })
  orderDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true })
  expectedDate!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => PagePurchaseOrderItemResDto, { each: true })
  items!: PagePurchaseOrderItemResDto[];

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  ordererBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  orderedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  cancellerBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  cancelledAt!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  cancellationReason!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
