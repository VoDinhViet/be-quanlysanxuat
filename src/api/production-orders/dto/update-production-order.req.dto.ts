import { ClassField } from '../../../decorators/field.decorators';
import { UpdateProductionOrderItemReqDto } from './update-production-order-item.req.dto';

/** "Lưu lại" ở Tab2 — replace-all: mọi dòng PO trạng thái NORMAL đều phải có mặt. */
export class UpdateProductionOrderReqDto {
  @ClassField(() => UpdateProductionOrderItemReqDto, { each: true })
  readonly items!: UpdateProductionOrderItemReqDto[];
}
