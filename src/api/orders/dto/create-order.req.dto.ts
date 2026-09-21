import {
  Currency,
  OrderDiscountType,
  OrderStatus,
  PaymentTerm,
} from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { OrderItemReqDto } from './order-item.req.dto';

export class CreateOrderReqDto {
  @UUIDFieldOptional({
    nullable: true,
    description: 'Client (khách hàng) id — optional temporarily',
  })
  readonly clientId?: string | null;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Nhân viên kinh doanh (users.id) id',
  })
  readonly assignedUserId?: string | null;

  @DateField({ description: 'Ngày đặt hàng' })
  readonly orderDate!: Date;

  @DateField({ description: 'Ngày giao hàng yêu cầu' })
  readonly dueDate!: Date;

  @StringFieldOptional({
    maxLength: 500,
    nullable: true,
    description:
      'Địa chỉ người nhận hàng — có thể khác khách hàng đặt đơn (đại lý/đối tác)',
  })
  readonly consigneeAddress?: string | null;

  @EnumFieldOptional(() => PaymentTerm, { nullable: true })
  readonly paymentTerm?: PaymentTerm | null;

  @EnumFieldOptional(() => Currency, { description: 'Defaults to VND' })
  readonly currency?: Currency;

  @NumberFieldOptional({
    min: 0.000001,
    description:
      'Defaults to 1. Must be positive — dashboard totals convert every order to VND via total * exchangeRate.',
  })
  readonly exchangeRate?: number;

  @EnumFieldOptional(() => OrderDiscountType, {
    description: 'Defaults to PERCENT',
  })
  readonly discountType?: OrderDiscountType;

  @NumberFieldOptional({
    min: 0,
    description:
      'Chiết khấu đơn — % hoặc số tiền tuỳ discountType; defaults to 0',
  })
  readonly discountValue?: number;

  @NumberFieldOptional({
    min: 0,
    max: 100,
    description: 'Thuế VAT (%); defaults to 0',
  })
  readonly vatPercent?: number;

  @NumberFieldOptional({
    min: 0,
    description: 'Phí vận chuyển; defaults to 0',
  })
  readonly shippingFee?: number;

  @EnumFieldOptional(() => OrderStatus, {
    description:
      'Defaults to DRAFT. Cannot be set to AWAITING_PRODUCTION or REJECTED.',
  })
  readonly status?: OrderStatus;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly internalNote?: string | null;

  @ClassFieldOptional(() => OrderItemReqDto, { each: true })
  readonly items?: OrderItemReqDto[];

  @UUIDFieldOptional({
    each: true,
    description: 'File ids (from POST /files, type=ORDER_DOCUMENT)',
  })
  readonly fileIds?: string[];
}
