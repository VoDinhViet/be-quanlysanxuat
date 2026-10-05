import { PickType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { ClassField } from '../../../decorators/field.decorators';
import { OrderResDto } from '../../orders/dto/order.res.dto';
import { ProductionOrderResDto } from '../../production-orders/dto/production-order.res.dto';

/** Đơn hàng của LSX: `code` là mã SO nội bộ, `buyerPoNo` là số PO của khách (cột "PO / Lý do"). */
@Exclude()
class RequisitionOrderResDto extends PickType(OrderResDto, [
  'id',
  'code',
  'buyerPoNo',
] as const) {}

/** `ProductionOrderRefResDto` (dùng chung) chỉ có `id`/`code` (mã LSX) — phiếu lãnh cần thêm đơn
 * hàng nguồn (mã SO + số PO khách), nên không tái dùng được, phải khai riêng ở đây thay vì đè lên
 * DTO dùng chung. */
@Exclude()
export class RequisitionProductionOrderResDto extends PickType(
  ProductionOrderResDto,
  ['id', 'code'] as const,
) {
  @Expose()
  @ClassField(() => RequisitionOrderResDto)
  order!: RequisitionOrderResDto;
}
