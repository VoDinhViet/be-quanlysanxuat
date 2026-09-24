import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDefined } from 'class-validator';
import { UUIDField } from '../../../decorators/field.decorators';

export class ExportOrdersReqDto {
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
    message: 'Vui lòng chọn ít nhất một đơn hàng để xuất.',
  })
  @IsArray({ message: 'Danh sách đơn hàng không hợp lệ.' })
  @ArrayMinSize(1, {
    message: 'Vui lòng chọn ít nhất một đơn hàng để xuất.',
  })
  @UUIDField({
    each: true,
    description: 'Danh sách ID đơn hàng cần xuất (bắt buộc)',
  })
  readonly orderIds: string[];
}
