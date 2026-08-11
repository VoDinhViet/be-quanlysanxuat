import { Exclude, Expose } from 'class-transformer';

import {
  Currency,
  OrderDiscountType,
  OrderStatus,
  PaymentTerm,
} from '../../../database/schemas';
import {
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
import { ClientBaseResDto } from '../../clients/dto/client-base.res.dto';

@Exclude()
export class OrderBaseResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Order code' })
  code!: string;

  @Expose()
  @ClassFieldOptional(() => ClientBaseResDto, { nullable: true })
  client!: ClientBaseResDto | null;

  @Expose()
  @DateField({ description: 'Ngày đặt hàng' })
  orderDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày giao hàng yêu cầu' })
  dueDate!: Date | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description:
      'Địa chỉ người nhận hàng — có thể khác khách hàng đặt đơn (đại lý/đối tác)',
  })
  consigneeAddress!: string | null;

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
  @DateFieldOptional({ nullable: true })
  approvedAt!: Date | null;

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
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  internalNote!: string | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
