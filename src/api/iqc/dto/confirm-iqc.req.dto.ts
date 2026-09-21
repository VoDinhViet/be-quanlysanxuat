import { IqcDisposition, IqcResult } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/**
 * Nút "Lưu" duy nhất của trang chi tiết IQC — ghi đè toàn bộ quyết định QC mỗi lần gọi (không
 * phải patch một phần): field vắng mặt nghĩa là xoá, không phải giữ nguyên. QC tự chọn `result`
 * hoàn toàn.
 */
export class ConfirmIqcReqDto {
  @DateFieldOptional({
    description:
      'Thời điểm kiểm thực tế — bỏ trống là giữ nguyên ngày kiểm lúc tạo',
  })
  readonly inspectionDate?: Date;

  @EnumField(() => IqcResult, {
    description: 'Kết quả QC — QC tự chọn',
  })
  readonly result!: IqcResult;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú kết quả' })
  readonly resultNote?: string;

  @UUIDFieldOptional({
    each: true,
    description: 'File bằng chứng kiểm tra (QC) — thay toàn bộ mỗi lần gọi',
  })
  readonly qcEvidenceFileIds?: string[];

  @EnumFieldOptional(() => IqcDisposition, {
    description:
      'Phương án xử lý — chỉ có ý nghĩa khi result = FAIL; gửi kèm PASS sẽ bị bỏ qua, không báo lỗi',
  })
  readonly disposition?: IqcDisposition;

  @NumberFieldOptional({
    min: 0,
    description: 'SL OK khi disposition = SORT',
  })
  readonly sortOkQty?: number;

  @NumberFieldOptional({
    min: 0,
    description: 'SL NG (trả NCC) khi disposition = SORT',
  })
  readonly sortNgQty?: number;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú quyết định' })
  readonly dispositionNote?: string;

  @UUIDFieldOptional({
    each: true,
    description: 'File bằng chứng quyết định xử lý — thay toàn bộ mỗi lần gọi',
  })
  readonly dispositionEvidenceFileIds?: string[];
}
