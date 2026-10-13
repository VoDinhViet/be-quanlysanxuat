import { ProductionOrderNcrAction } from '../../../database/schemas';
import { EnumField } from '../../../decorators/field.decorators';

export class CreateNcrProductionOrderReqDto {
  @EnumField(() => ProductionOrderNcrAction, {
    description: 'REWORK = LSX sửa chữa, REMAKE = LSX làm mới',
  })
  readonly action!: ProductionOrderNcrAction;
}
