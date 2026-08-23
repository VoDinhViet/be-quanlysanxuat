import { PickType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { ClassField } from '../../../decorators/field.decorators';
import { OrderRefResDto } from '../../orders/dto/order-ref.res.dto';
import { ProductionOrderResDto } from '../../production-orders/dto/production-order.res.dto';

/** `ProductionOrderRefResDto` (dùng chung) chỉ có `id`/`code` (mã LSX) — phiếu lãnh cần thêm
 * `order.code` (mã PO) cho cột "PO/Lý do", nên không tái dùng được, phải khai riêng ở đây thay vì
 * đè lên DTO dùng chung. */
@Exclude()
export class RequisitionProductionOrderResDto extends PickType(
  ProductionOrderResDto,
  ['id', 'code'] as const,
) {
  @Expose()
  @ClassField(() => OrderRefResDto)
  order!: OrderRefResDto;
}
