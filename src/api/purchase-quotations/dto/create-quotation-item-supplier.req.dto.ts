import {
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateQuotationItemSupplierReqDto {
  @UUIDField({ description: 'NCC được hỏi giá cho vật tư này' })
  readonly supplierId!: string;

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
