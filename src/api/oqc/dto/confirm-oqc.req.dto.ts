import { IqcResult, OqcDisposition } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class ConfirmOqcReqDto {
  @DateFieldOptional({
    description:
      'Thời điểm kiểm thực tế — bỏ trống là giữ nguyên ngày kiểm lúc tạo',
  })
  readonly inspectionDate?: Date;

  @EnumField(() => IqcResult, {
    description: 'Kết quả QC — QC tự chọn',
  })
  readonly result!: IqcResult;

  @StringFieldOptional({
    maxLength: 500,
    description: 'Ghi chú kết quả',
  })
  readonly resultNote?: string;

  @UUIDFieldOptional({
    each: true,
    description: 'File bằng chứng kiểm tra (QC)',
  })
  readonly qcEvidenceFileIds?: string[];

  @EnumFieldOptional(() => OqcDisposition, {
    description:
      'Cách xử lý khi FAIL — chỉ có ý nghĩa khi result cuối cùng = FAIL; gửi kèm PASS sẽ bị bỏ qua, không báo lỗi',
  })
  readonly disposition?: OqcDisposition;

  @StringFieldOptional({
    maxLength: 500,
    description: 'Ghi chú xử lý (tuỳ chọn)',
  })
  readonly dispositionNote?: string;

  @UUIDFieldOptional({
    each: true,
    description: 'File bằng chứng quyết định xử lý',
  })
  readonly dispositionEvidenceFileIds?: string[];

  @NumberFieldOptional({
    min: 0,
    description:
      'SL đạt sau sàng lọc — bắt buộc khi disposition = SORT, tổng với sortNgQty phải bằng SL lô',
  })
  readonly sortOkQty?: number;

  @NumberFieldOptional({
    min: 0,
    description:
      'SL không đạt sau sàng lọc — bắt buộc khi disposition = SORT; > 0 thì tự sinh NCR-NB',
  })
  readonly sortNgQty?: number;
}
