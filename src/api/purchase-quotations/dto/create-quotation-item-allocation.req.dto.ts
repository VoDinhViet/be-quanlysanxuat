import {
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateQuotationItemAllocationReqDto {
  @UUIDField({
    description:
      'Id dòng đề xuất mua hàng (purchase_request_items) được gộp vào vật tư này',
  })
  readonly purchaseRequestItemId!: string;

  @NumberField({
    isPositive: true,
    description: 'SL báo giá phân bổ cho dòng đề xuất này',
  })
  readonly quantity!: number;

  @StringFieldOptional({
    maxLength: 500,
    description: 'Lý do khi SL phân bổ khác SL đề xuất gốc của dòng này',
  })
  readonly quantityAdjustmentReason?: string;
}
