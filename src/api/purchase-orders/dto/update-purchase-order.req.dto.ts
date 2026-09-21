import { PaymentTerm } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdatePurchaseOrderReqDto {
  @DateFieldOptional({ description: 'Ngày giao dự kiến' })
  readonly expectedDate?: Date;

  @UUIDFieldOptional({ nullable: true, description: 'Người phụ trách' })
  readonly assignedUserId?: string | null;

  @EnumFieldOptional(() => PaymentTerm, {
    nullable: true,
    description: 'Điều khoản thanh toán',
  })
  readonly paymentTerm?: PaymentTerm | null;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
