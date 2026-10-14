import {
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateQuotationItemSupplierReqDto {
  @UUIDField({ description: 'NCC được hỏi giá cho vật tư này' })
  readonly supplierId!: string;

  @NumberFieldOptional({
    min: 0,
    description: 'Đơn giá NCC báo — điền ngay nếu đã biết',
  })
  readonly unitPrice?: number;

  @StringFieldOptional({
    maxLength: 50,
    description:
      'Đơn vị báo giá (ĐVBG) khi NCC báo khác đơn vị chính; đi cùng quotationQuantity',
  })
  readonly quotationUnit?: string;

  @NumberFieldOptional({
    min: 0,
    description: 'SL báo giá theo ĐVBG; thành tiền = đơn giá × SL báo giá',
  })
  readonly quotationQuantity?: number;

  @NumberFieldOptional({
    min: 0,
    int: true,
    description: 'Thời gian giao hàng (ngày)',
  })
  readonly leadTimeDays?: number;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;

  @UUIDFieldOptional({
    each: true,
    description: 'File ids (from POST /files?type=QUOTATION_SUPPLIER_EVIDENCE)',
  })
  readonly fileIds?: string[];
}
