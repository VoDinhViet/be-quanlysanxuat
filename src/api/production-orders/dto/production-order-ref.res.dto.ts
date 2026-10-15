import { PickType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { StringFieldOptional } from '../../../decorators/field.decorators';
import { ProductionOrderResDto } from './production-order.res.dto';

/** Ref nhẹ cho DTO của domain khác. `buyerPoNo` không nằm trên `production_orders`: service nhúng
 * phải tự làm phẳng từ `order.buyerPoNo` (ví dụ `flattenBuyerPoNo` của `purchase-requests`). */
@Exclude()
export class ProductionOrderRefResDto extends PickType(ProductionOrderResDto, [
  'id',
  'code',
] as const) {
  @Expose()
  @StringFieldOptional({ nullable: true })
  buyerPoNo!: string | null;
}
