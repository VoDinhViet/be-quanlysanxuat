import { NumberField, UUIDField } from '../../../decorators/field.decorators';

export class CreateItemUnitReqDto {
  @UUIDField({ description: 'Đơn vị phụ — phải khác đơn vị gốc của item' })
  readonly unitId!: string;

  @NumberField({
    isPositive: true,
    description: '1 đơn vị này = bao nhiêu đơn vị gốc của item',
  })
  readonly conversionFactor!: number;
}
