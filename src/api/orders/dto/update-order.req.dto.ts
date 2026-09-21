import {
  Currency,
  OrderDiscountType,
  OrderStatus,
  PaymentTerm,
} from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { OrderItemReqDto } from './order-item.req.dto';

export class UpdateOrderReqDto {
  @UUIDFieldOptional({ description: 'Client (khách hàng) id' })
  readonly clientId?: string;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Nhân viên kinh doanh (users.id) id',
  })
  readonly assignedUserId?: string | null;

  @DateFieldOptional({ description: 'Ngày đặt hàng' })
  readonly orderDate?: Date;

  @DateFieldOptional({ description: 'Ngày giao hàng yêu cầu' })
  readonly dueDate?: Date;

  @StringFieldOptional({
    maxLength: 500,
    nullable: true,
    description:
      'Địa chỉ người nhận hàng — có thể khác khách hàng đặt đơn (đại lý/đối tác)',
  })
  readonly consigneeAddress?: string | null;

  @EnumFieldOptional(() => PaymentTerm, { nullable: true })
  readonly paymentTerm?: PaymentTerm | null;

  @EnumFieldOptional(() => Currency)
  readonly currency?: Currency;

  @NumberFieldOptional({
    min: 0.000001,
    description:
      'Must be positive — dashboard totals convert every order to VND via total * exchangeRate.',
  })
  readonly exchangeRate?: number;

  @EnumFieldOptional(() => OrderDiscountType)
  readonly discountType?: OrderDiscountType;

  @NumberFieldOptional({ min: 0, description: 'Chiết khấu đơn' })
  readonly discountValue?: number;

  @NumberFieldOptional({ min: 0, max: 100, description: 'Thuế VAT (%)' })
  readonly vatPercent?: number;

  @NumberFieldOptional({ min: 0, description: 'Phí vận chuyển' })
  readonly shippingFee?: number;

  @EnumFieldOptional(() => OrderStatus)
  readonly status?: OrderStatus;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly internalNote?: string | null;

  @ClassFieldOptional(() => OrderItemReqDto, { each: true })
  readonly items?: OrderItemReqDto[];

  @UUIDFieldOptional({
    each: true,
    description:
      'File ids (from POST /files, type=ORDER_DOCUMENT); replaces the full set',
  })
  readonly fileIds?: string[];
}
