import { OrderStatus } from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { OrderItemReqDto } from './order-item.req.dto';

export class CreateOrderReqDto {
  @UUIDField({ description: 'Client (khách hàng) id' })
  readonly clientId!: string;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Staff (nhân viên kinh doanh) — a `users` row id',
  })
  readonly staffId?: string | null;

  @StringFieldOptional({
    maxLength: 50,
    description: 'Order code; auto-generated (SOxxxx) if omitted',
  })
  readonly code?: string;

  @DateFieldOptional({ description: 'Defaults to today if omitted' })
  readonly orderDate?: Date;

  @DateFieldOptional({ nullable: true, description: 'Delivery date' })
  readonly deliveryDate?: Date | null;

  @StringFieldOptional({
    maxLength: 100,
    nullable: true,
    description: 'Payment terms, free text (e.g. "TT 30 ngày")',
  })
  readonly paymentTerms?: string | null;

  @EnumFieldOptional(() => OrderStatus, { description: 'Defaults to DRAFT' })
  readonly status?: OrderStatus;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassFieldOptional(() => OrderItemReqDto, { each: true })
  readonly items?: OrderItemReqDto[];
}
