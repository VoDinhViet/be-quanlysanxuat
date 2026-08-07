import { ItemType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

/** Không phân trang — luôn trả cả danh sách cho dropdown, giới hạn 100. Chỉ trả item `ACTIVE`;
 * `type` để tách use case theo FG (đơn hàng) / WIP (node BOM) / RM (vật tư node BOM). */
export class GetItemOptionsReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;

  @EnumFieldOptional(() => ItemType)
  readonly type?: ItemType;
}
