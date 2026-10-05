import { PaymentTerm } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
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

  @NumberFieldOptional({
    min: 0,
    max: 100,
    description: 'Thuế VAT (% trên tiền hàng), 0–100',
  })
  readonly vatPercent?: number;

  @NumberFieldOptional({ min: 0, description: 'Chi phí khác của cả đơn (VNĐ)' })
  readonly otherCost?: number;

  @StringFieldOptional({
    nullable: true,
    maxLength: 255,
    description: 'Diễn giải chi phí khác',
  })
  readonly otherCostNote?: string | null;
}
