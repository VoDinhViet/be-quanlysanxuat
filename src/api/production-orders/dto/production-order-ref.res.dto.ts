import { PickType } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';

import { StringFieldOptional } from '../../../decorators/field.decorators';
import { ProductionOrderResDto } from './production-order.res.dto';

/** Ref nhẹ dùng cho danh sách — `PickType` lấy `id`/`code`, thêm `buyerPoNo` (flatten
 *  từ `order.buyerPoNo`) để cột "PO liên quan / Lý do" hiển thị được số PO khách hàng
 *  mà không cần thay đổi cấu trúc response phức tạp hơn. */
@Exclude()
export class ProductionOrderRefResDto extends PickType(ProductionOrderResDto, [
  'id',
  'code',
] as const) {
  /** Số PO khách hàng của đơn hàng gốc (flatten từ `order.buyerPoNo`). */
  @Expose()
  @StringFieldOptional({ nullable: true })
  @Transform(
    ({ obj }: { obj: { order?: { buyerPoNo?: string | null } | null } }) =>
      obj.order?.buyerPoNo ?? null,
  )
  buyerPoNo!: string | null;
}
