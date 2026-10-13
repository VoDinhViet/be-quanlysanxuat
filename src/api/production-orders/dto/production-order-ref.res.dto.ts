import { PickType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { StringFieldOptional } from '../../../decorators/field.decorators';
import { ProductionOrderResDto } from './production-order.res.dto';

/** Ref nhẹ dùng cho danh sách — `PickType` lấy `id`/`code`, thêm `buyerPoNo` (do service làm phẳng
 *  từ `order.buyerPoNo`, xem `flattenProductionOrderBuyerPoNo` của đề xuất mua hàng). */
@Exclude()
export class ProductionOrderRefResDto extends PickType(ProductionOrderResDto, [
  'id',
  'code',
] as const) {
  /** Số PO khách hàng của đơn hàng gốc. */
  @Expose()
  @StringFieldOptional({ nullable: true })
  buyerPoNo!: string | null;
}
