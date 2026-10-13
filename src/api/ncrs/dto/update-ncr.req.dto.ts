import {
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateNcrReqDto {
  @StringFieldOptional({ maxLength: 1000 })
  readonly defectDescription?: string;

  @StringFieldOptional({ maxLength: 2000, description: 'Nguyên nhân' })
  readonly rootCause?: string;

  @StringFieldOptional({ maxLength: 2000, description: 'Biện pháp khắc phục' })
  readonly correctiveAction?: string;

  @StringFieldOptional({
    maxLength: 2000,
    description: 'Biện pháp phòng ngừa / cải tiến',
  })
  readonly preventiveAction?: string;

  @UUIDFieldOptional({ description: 'Bộ phận phát sinh NCR' })
  readonly departmentId?: string;

  @NumberFieldOptional({
    min: 0,
    description: 'SL hàng lỗi — chỉ sửa được với NCR tạo tay',
  })
  readonly ngQty?: number;

  @NumberFieldOptional({ min: 0, description: 'SL sửa chữa' })
  readonly reworkQty?: number;

  @NumberFieldOptional({ min: 0, description: 'SL làm mới' })
  readonly remakeQty?: number;

  @UUIDFieldOptional({
    each: true,
    description: 'Công đoạn cần sửa chữa (chọn từ routing của sản phẩm)',
  })
  readonly reworkOperationIds?: string[];
}
