import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateQuotationItemReqDto {
  @UUIDField({
    description: 'Id dòng đề xuất mua hàng (purchase_request_items)',
  })
  readonly purchaseRequestItemId!: string;

  @NumberField({ isPositive: true, description: 'SL hỏi giá' })
  readonly quantity!: number;

  @NumberFieldOptional({
    min: 0,
    description: 'Đơn giá NCC báo — điền ngay nếu đã biết',
  })
  readonly unitPrice?: number;

  @NumberFieldOptional({
    min: 0,
    int: true,
    description: 'Thời gian giao hàng (ngày)',
  })
  readonly leadTimeDays?: number;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;
}
