import { IqcResult, OqcDisposition } from '../../../database/schemas';
import {
  EnumField,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class ConfirmOqcReqDto {
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
}
