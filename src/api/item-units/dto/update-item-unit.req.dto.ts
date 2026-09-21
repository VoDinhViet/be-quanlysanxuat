import { NumberField } from '../../../decorators/field.decorators';

export class UpdateItemUnitReqDto {
  @NumberField({
    isPositive: true,
    description: '1 đơn vị này = bao nhiêu đơn vị gốc của item',
  })
  readonly conversionFactor!: number;
}
