import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdatePurchaseOrderItemReqDto {
  @NumberFieldOptional({ isPositive: true, description: 'SL đặt' })
  readonly quantity?: number;

  @NumberFieldOptional({ isPositive: true, description: 'Đơn giá' })
  readonly unitPrice?: number;

  @StringFieldOptional({
    nullable: true,
    maxLength: 500,
    description: 'Lý do điều chỉnh SL',
  })
  readonly quantityAdjustmentReason?: string | null;
}
