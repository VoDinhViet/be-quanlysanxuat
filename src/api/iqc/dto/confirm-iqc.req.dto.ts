import {
  IqcDisposition,
  IqcInspectionLevel,
  IqcResult,
} from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { AQL_LEVELS } from '../iqc-aql.constant';

/**
 * Nút "Lưu" duy nhất của trang chi tiết IQC — ghi đè toàn bộ quyết định QC mỗi lần gọi (không
 * phải patch một phần): field vắng mặt nghĩa là xoá, không phải giữ nguyên. QC tự chọn `result`;
 * bảng AQL chỉ còn là gợi ý hiển thị (`IqcService.getIqc` tính `ac`/`re` tham khảo), không còn
 * chặn được `confirm` (xem `docs/domains/quality.md`).
 */
export class ConfirmIqcReqDto {
  @EnumField(() => IqcInspectionLevel, {
    description: 'Mức kiểm tra (Inspection Level)',
  })
  readonly inspectionLevel!: IqcInspectionLevel;

  @NumberField({
    description: `Mức AQL (%) — một trong ${AQL_LEVELS.join('/')}`,
  })
  readonly aqlLevel!: number;

  @NumberField({
    int: true,
    isPositive: true,
    description: 'Cỡ mẫu — auto tính từ bảng AQL, cho sửa tay',
  })
  readonly sampleSize!: number;

  @NumberField({
    int: true,
    min: 0,
    description: 'Số lượng lỗi đếm được trong mẫu',
  })
  readonly defectQty!: number;

  @StringFieldOptional({
    maxLength: 100,
    description: 'Tiêu chuẩn kiểm — vd VT-0152 Rev.02',
  })
  readonly inspectionStandard?: string;

  @StringFieldOptional({
    maxLength: 100,
    description: 'Tên người kiểm thực tế',
  })
  readonly inspectorName?: string;

  @StringFieldOptional({
    maxLength: 255,
    description: 'Dụng cụ đo đã dùng',
  })
  readonly measuringTools?: string;

  @DateFieldOptional({
    description:
      'Thời điểm kiểm thực tế — bỏ trống là giữ nguyên ngày kiểm lúc tạo',
  })
  readonly inspectionDate?: Date;

  @EnumField(() => IqcResult, {
    description: 'Kết quả QC — QC tự chọn, không suy từ bảng AQL',
  })
  readonly result!: IqcResult;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú kết quả' })
  readonly resultNote?: string;

  @UUIDFieldOptional({
    each: true,
    description: 'File bằng chứng kiểm tra (QC) — thay toàn bộ mỗi lần gọi',
  })
  readonly qcEvidenceFileIds?: string[];

  @UUIDFieldOptional({ description: 'Bộ phận QC đã kiểm' })
  readonly qcDepartmentId?: string;

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
