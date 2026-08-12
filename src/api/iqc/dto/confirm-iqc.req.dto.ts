import { IqcInspectionLevel } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumField,
  NumberField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { AQL_LEVELS } from '../iqc-aql.constant';

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
}
