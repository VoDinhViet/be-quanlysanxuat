import { Exclude, Expose } from 'class-transformer';

import {
  PaymentTerm,
  PurchaseOrderStatus,
  PurchaseQuotationStatus,
} from '../../../database/schemas';
import {
  ClassField,
  BooleanField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { QuotationRefResDto } from '../../purchase-quotations/dto/quotation-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { PurchaseOrderProgress } from '../purchase-orders.constant';
import { PurchaseOrderAmountsResDto } from './purchase-order-amounts.res.dto';
import { PurchaseOrderItemResDto } from './purchase-order-item.res.dto';

@Exclude()
export class OrderBlockerResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã đơn mua' })
  code!: string;
}

@Exclude()
export class PurchaseOrderResDto extends PurchaseOrderAmountsResDto {
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
  @NumberField({
    description: 'Tổng tiền = tiền hàng + VAT + chi phí khác',
  })
  totalAmount!: number;

  @Expose()
  @ClassFieldOptional(() => QuotationRefResDto, { nullable: true })
  quotation!: QuotationRefResDto | null;

  @Expose()
  @EnumFieldOptional(() => PurchaseQuotationStatus, { nullable: true })
  quotationStatus!: PurchaseQuotationStatus | null;

  @Expose()
  @BooleanField({
    description:
      'Có thể huỷ PO kèm mở lại RFQ (`reopenQuotation`): PO thuộc RFQ APPROVED và RFQ không còn PO ORDERED khác',
  })
  canReopenQuotation!: boolean;

  @Expose()
  @ClassFieldOptional(() => OrderBlockerResDto, { each: true })
  reopenBlockedBy!: OrderBlockerResDto[];

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
  closerBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Có giá trị = PO đã đóng sớm',
  })
  closedAt!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  closureReason!: string | null;

  @Expose()
  @EnumField(() => PurchaseOrderProgress, {
    description:
      'Tiến độ nhận hàng, cùng giá trị với `progress` ở danh sách — suy từ status + SL nhận/đặt, không phải cột DB',
  })
  progress!: PurchaseOrderProgress;

  @Expose()
  @BooleanField({
    description:
      'Có thể đóng sớm: PO ORDERED chưa đóng, đã nhận một phần (có dòng nhận < đặt, tổng nhận > 0) và không còn phiếu nhập chưa ghi sổ',
  })
  canClose!: boolean;

  @Expose()
  @ClassFieldOptional(() => OrderBlockerResDto, { each: true })
  closeBlockedBy!: OrderBlockerResDto[];

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
