import {
  Currency,
  OrderDiscountType,
  OrderStatus,
  PaymentTerm,
} from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  EmailFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { OrderItemReqDto } from './order-item.req.dto';

/**
 * Every derived amount (`subtotal`, `discountAmount`, `vatAmount`, `total`, and each line's
 * `lineTotal`) is server-computed by `OrdersService.recalculateTotals` — there is deliberately no
 * field for any of them here. `contactName`/`contactPhone`/`contactEmail` are a snapshot picked
 * from a `client_contacts` row at submit time, not a foreign key (see the schema comment on
 * `orders`).
 */
export class CreateOrderReqDto {
  @StringFieldOptional({
    maxLength: 50,
    description: 'Order code; auto-generated (SOxxxx) if omitted',
  })
  readonly code?: string;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Client (khách hàng) id — optional temporarily',
  })
  readonly clientId?: string | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly contactName?: string | null;

  @StringFieldOptional({ maxLength: 30, nullable: true })
  readonly contactPhone?: string | null;

  @EmailFieldOptional({ nullable: true })
  readonly contactEmail?: string | null;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Nhân viên kinh doanh (users.id) id',
  })
  readonly staffId?: string | null;

  @DateField({ description: 'Ngày đặt hàng' })
  readonly orderDate!: Date;

  @DateField({ description: 'Ngày giao hàng yêu cầu' })
  readonly dueDate!: Date;

  @StringFieldOptional({ maxLength: 500, nullable: true })
  readonly deliveryAddress?: string | null;

  @EnumFieldOptional(() => PaymentTerm, { nullable: true })
  readonly paymentTerm?: PaymentTerm | null;

  @EnumFieldOptional(() => Currency, { description: 'Defaults to VND' })
  readonly currency?: Currency;

  @NumberFieldOptional({ min: 0, description: 'Defaults to 1' })
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
    description: 'Defaults to CONFIRMED',
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
    description: 'Attachment file ids (from POST /files, type=ORDER_DOCUMENT)',
  })
  readonly attachmentFileIds?: string[];
}
