import { ClassField } from '../../../decorators/field.decorators';
import { UpdateProductionOrderItemReqDto } from './update-production-order-item.req.dto';

export class UpdateProductionOrderReqDto {
  @ClassField(() => UpdateProductionOrderItemReqDto, { each: true })
  readonly items!: UpdateProductionOrderItemReqDto[];
}
