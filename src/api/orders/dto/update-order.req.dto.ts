import {
  Currency,
  OrderDiscountType,
  OrderStatus,
  PaymentTerm,
} from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateFieldOptional,
  EmailFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { OrderItemReqDto } from './order-item.req.dto';

/**
 * No `code` field — immutable after creation, same convention as `UpdateMaterialReqDto`.
 *
 * Rules:
 * - Blocked once the order reaches `COMPLETED`/`CANCELLED` (`E065` — see
 *   `OrdersService.ensureOrderEditable`); every other status stays editable.
 * - `items`/`attachmentFileIds` are replace-all: sending `[]` clears them, omitting the field
 *   keeps the existing set.
 * - Every derived amount is recomputed server-side after the write, same as `CreateOrderReqDto`.
 */
export class UpdateOrderReqDto {
  @UUIDFieldOptional({ description: 'Client (khách hàng) id' })
  readonly clientId?: string;

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

  @DateFieldOptional({ description: 'Ngày đặt hàng' })
  readonly orderDate?: Date;

  @DateFieldOptional({ description: 'Ngày giao hàng yêu cầu' })
  readonly dueDate?: Date;

  @StringFieldOptional({ maxLength: 500, nullable: true })
  readonly deliveryAddress?: string | null;

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
      'Attachment file ids (from POST /files, type=ORDER_DOCUMENT); replaces the full set',
  })
  readonly attachmentFileIds?: string[];
}
