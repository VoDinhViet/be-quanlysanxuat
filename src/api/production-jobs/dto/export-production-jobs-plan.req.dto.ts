import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDefined } from 'class-validator';
import { UUIDField } from '../../../decorators/field.decorators';

export class ExportProductionJobsPlanReqDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.map((id) => String(id).trim()).filter(Boolean);
    }
    return value;
  })
  @IsDefined({
    message: 'Vui lòng chọn ít nhất một Job để xuất.',
  })
  @IsArray({ message: 'Danh sách Job không hợp lệ.' })
  @ArrayMinSize(1, {
    message: 'Vui lòng chọn ít nhất một Job để xuất.',
  })
  @UUIDField({
    each: true,
    description: 'Danh sách ID Job sản xuất cần xuất (bắt buộc)',
  })
  readonly jobIds: string[];
}
