import { NumberField } from '../../../decorators/field.decorators';

export class UpdateProductionJobOperationReqDto {
  @NumberField({
    min: 0,
    description: 'SL đã hoàn thành — ghi đè, không cộng dồn',
  })
  completedQuantity!: number;
}
