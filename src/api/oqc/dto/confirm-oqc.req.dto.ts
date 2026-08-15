import { IqcInspectionLevel, IqcResult } from '../../../database/schemas';
import {
  EnumField,
  NumberField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { AQL_LEVELS } from '../../iqc/iqc-aql.constant';

/**
 * Nút "Lưu" duy nhất của trang chi tiết OQC — ghi đè toàn bộ quyết định QC mỗi lần gọi (field vắng
 * mặt nghĩa là xoá, không phải giữ nguyên). Gọi lại được nhiều lần trừ khi đã `COMPLETED` (`E177`
 * — khoá cứng, khác IQC). Xem `docs/domains/quality.md`.
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

  @EnumField(() => IqcResult, {
    description: 'Kết quả QC — QC tự chọn, không suy từ bảng AQL',
  })
  readonly result!: IqcResult;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú kết quả' })
  readonly resultNote?: string;
}
