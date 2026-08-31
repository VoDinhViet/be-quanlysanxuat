import { Exclude, Expose } from 'class-transformer';

import { PaymentTerm, PurchaseOrderStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { QuotationRefResDto } from '../../purchase-quotations/dto/quotation-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { PurchaseOrderItemResDto } from './purchase-order-item.res.dto';

@Exclude()
export class PurchaseOrderResDto {
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
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  assignedUser!: UserRefResDto | null;

  @Expose()
  @EnumFieldOptional(() => PaymentTerm, { nullable: true })
  paymentTerm!: PaymentTerm | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => QuotationRefResDto, { nullable: true })
  quotation!: QuotationRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => PurchaseOrderItemResDto, { each: true })
  items!: PurchaseOrderItemResDto[];

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
