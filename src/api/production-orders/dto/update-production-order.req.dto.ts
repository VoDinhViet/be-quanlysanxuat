import { ClassField } from '../../../decorators/field.decorators';
import { UpdateProductionOrderItemReqDto } from './update-production-order-item.req.dto';

/** Partial — chỉ dòng có mặt trong `items` mới bị ghi, dòng không gửi giữ nguyên (khác replace-all). */
export class UpdateProductionOrderReqDto {
  @ClassField(() => UpdateProductionOrderItemReqDto, { each: true })
  readonly items!: UpdateProductionOrderItemReqDto[];
}
