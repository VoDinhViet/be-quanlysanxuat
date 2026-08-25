import { NumberField } from '../../../decorators/field.decorators';

export class UpdateProductionJobOperationReqDto {
  @NumberField({
    min: 0,
    description: 'SL đã hoàn thành (đạt) — ghi đè, không cộng dồn',
  })
  completedQuantity!: number;

  @NumberField({
    min: 0,
    description: 'SL không đạt (NG) — ghi đè, không cộng dồn',
  })
  rejectedQuantity!: number;
}
