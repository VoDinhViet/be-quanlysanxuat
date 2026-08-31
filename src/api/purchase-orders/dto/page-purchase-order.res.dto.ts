import { Exclude, Expose } from 'class-transformer';

import { PaymentTerm, PurchaseOrderStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { PurchaseRequestRefResDto } from '../../purchase-requests/dto/purchase-request-ref.res.dto';
import { QuotationRefResDto } from '../../purchase-quotations/dto/quotation-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { PurchaseOrderProgress } from '../purchase-orders.constant';

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
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  assignedUser!: UserRefResDto | null;

  @Expose()
  @EnumFieldOptional(() => PaymentTerm, { nullable: true })
  paymentTerm!: PaymentTerm | null;

  @Expose()
  @NumberField({ description: 'Số dòng vật tư' })
  itemCount!: number;

  @Expose()
  @NumberField({ description: 'Tổng giá trị (Σ SL đặt × đơn giá)' })
  totalAmount!: number;

  @Expose()
  @EnumField(() => PurchaseOrderProgress, {
    description:
      'Tiến độ nhận hàng, suy từ status + receivedQuantity/orderedQuantity — không phải cột DB',
  })
  progress!: PurchaseOrderProgress;

  @Expose()
  @ClassField(() => PurchaseRequestRefResDto, { each: true })
  purchaseRequests!: PurchaseRequestRefResDto[];

  @Expose()
  @ClassFieldOptional(() => QuotationRefResDto, { nullable: true })
  quotation!: QuotationRefResDto | null;

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
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
