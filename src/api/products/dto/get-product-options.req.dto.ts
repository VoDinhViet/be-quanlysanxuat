import { ProductType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

/** Không phân trang — luôn trả cả danh sách cho dropdown, giới hạn 100. Chỉ trả sản phẩm `ACTIVE`;
 * `type` để tách hai use case FG (đơn hàng) và WIP (node BOM). */
export class GetProductOptionsReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;

  @EnumFieldOptional(() => ProductType)
  readonly type?: ProductType;
}
