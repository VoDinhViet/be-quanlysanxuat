import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreatePurchaseOrderItemReqDto {
  @UUIDField({
    description:
      'Id dòng đề xuất mua hàng (purchase_request_items) cần đặt mua',
  })
  readonly purchaseRequestItemId!: string;

  @NumberField({ isPositive: true, description: 'SL đặt mua' })
  readonly quantity!: number;

  @NumberFieldOptional({ min: 0, description: 'Đơn giá' })
  readonly unitPrice?: number;

  @StringFieldOptional({
    maxLength: 500,
    description: 'Lý do khi SL đặt khác SL đề xuất gốc của dòng này',
  })
  readonly quantityAdjustmentReason?: string;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;
}
