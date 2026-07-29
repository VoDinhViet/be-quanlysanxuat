import { Exclude, Expose } from 'class-transformer';

import {
  Currency,
  OrderDiscountType,
  OrderStatus,
  PaymentTerm,
} from '../../../database/schemas';
import {
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
import { OrderAttachmentResDto } from './order-attachment.res.dto';
import { OrderClientRefResDto } from './order-client-ref.res.dto';
import { OrderCreatorResDto } from './order-creator.res.dto';
import { OrderItemResDto } from './order-item.res.dto';
import { OrderStaffRefResDto } from './order-staff-ref.res.dto';

@Exclude()
export class OrderResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Order code' })
  code!: string;

  @Expose()
  @ClassFieldOptional(() => OrderClientRefResDto, { nullable: true })
  client!: OrderClientRefResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  contactName!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  contactPhone!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  contactEmail!: string | null;

  @Expose()
  @ClassFieldOptional(() => OrderStaffRefResDto, { nullable: true })
  staff!: OrderStaffRefResDto | null;

  @Expose()
  @DateField({ description: 'Ngày đặt hàng' })
  orderDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày giao hàng yêu cầu' })
  dueDate!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  deliveryAddress!: string | null;

  @Expose()
  @EnumFieldOptional(() => PaymentTerm, { nullable: true })
  paymentTerm!: PaymentTerm | null;

  @Expose()
  @EnumField(() => Currency)
  currency!: Currency;

  @Expose()
  @NumberField()
  exchangeRate!: number;

  @Expose()
  @EnumField(() => OrderStatus)
  status!: OrderStatus;

  @Expose()
  @ClassFieldOptional(() => OrderCreatorResDto, { nullable: true })
  approver!: OrderCreatorResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  approvedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => OrderCreatorResDto, { nullable: true })
  rejecter!: OrderCreatorResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  rejectedAt!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  rejectionReason!: string | null;

  @Expose()
  @NumberField({ description: 'Tổng tiền hàng — server-computed' })
  subtotal!: number;

  @Expose()
  @EnumField(() => OrderDiscountType)
  discountType!: OrderDiscountType;

  @Expose()
  @NumberField({ description: 'Chiết khấu đơn (input)' })
  discountValue!: number;

  @Expose()
  @NumberField({
    description: 'Chiết khấu đơn quy đổi ra tiền — server-computed',
  })
  discountAmount!: number;

  @Expose()
  @NumberField({ description: 'Thuế VAT (%)' })
  vatPercent!: number;

  @Expose()
  @NumberField({ description: 'Tiền thuế VAT — server-computed' })
  vatAmount!: number;

  @Expose()
  @NumberField({ description: 'Phí vận chuyển' })
  shippingFee!: number;

  @Expose()
  @NumberField({
    description:
      'TỔNG THANH TOÁN — server-computed: subtotal - discountAmount + vatAmount + shippingFee',
  })
  total!: number;

  @Expose()
  @NumberField({
    description:
      'TỔNG THANH TOÁN quy đổi VND — server-computed: total * exchangeRate',
  })
  totalVnd!: number;

  @Expose()
  @BooleanField({
    description:
      'Derived, not stored: dueDate < now && status not in (COMPLETED, CANCELLED)',
  })
  expired!: boolean;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  internalNote!: string | null;

  @Expose()
  @ClassFieldOptional(() => OrderItemResDto, { each: true })
  items!: OrderItemResDto[];

  @Expose()
  @ClassFieldOptional(() => OrderAttachmentResDto, { each: true })
  attachments!: OrderAttachmentResDto[];

  @Expose()
  @ClassFieldOptional(() => OrderCreatorResDto, { nullable: true })
  creator!: OrderCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
