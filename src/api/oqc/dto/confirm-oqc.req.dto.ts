import {
  IqcInspectionLevel,
  IqcResult,
  OqcDisposition,
} from '../../../database/schemas';
import {
  EnumField,
  EnumFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { AQL_LEVELS } from '../../iqc/iqc-aql.constant';

/**
 * Nút "Lưu" duy nhất của trang chi tiết OQC — ghi đè toàn bộ quyết định QC mỗi lần gọi (field vắng
 * mặt nghĩa là xoá, không phải giữ nguyên). Gọi lại được nhiều lần trừ khi đã `COMPLETED` (`E177`
 * — khoá cứng, khác IQC). `sampleSize`/`result` vắng thì server tự suy từ bảng AQL
 * (`resolveAqlPlan`/`resolveAqlResult`) — cả hai đều không suy được thì `E200`. Xem
 * `docs/domains/quality.md`.
 */
export class ConfirmOqcReqDto {
  @EnumField(() => IqcInspectionLevel, {
    description: 'Mức kiểm tra (Inspection Level)',
  })
  readonly inspectionLevel!: IqcInspectionLevel;

  @NumberField({
    description: `Mức AQL (%) — một trong ${AQL_LEVELS.join('/')}`,
  })
  readonly aqlLevel!: number;

  @NumberFieldOptional({
    int: true,
    isPositive: true,
    description: 'Cỡ mẫu — auto tính từ bảng AQL nếu vắng, cho ghi đè tay',
  })
  readonly sampleSize?: number;

  @NumberField({
    int: true,
    min: 0,
    description: 'Số lượng lỗi đếm được trong mẫu',
  })
  readonly defectQty!: number;

  @EnumFieldOptional(() => IqcResult, {
    description:
      'Kết quả QC — vắng thì lấy theo Ac/Re tự suy (resultAuto); QC toàn quyền ghi đè, không cần lý do',
  })
  readonly result?: IqcResult;

  @StringFieldOptional({
    maxLength: 500,
    description: 'Ghi chú kết quả — bắt buộc khi result ghi đè resultAuto',
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
