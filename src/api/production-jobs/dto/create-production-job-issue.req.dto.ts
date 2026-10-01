import { NumberField, UUIDField } from '../../../decorators/field.decorators';

export class CreateProductionJobIssueReqDto {
  @UUIDField({ description: 'Vật tư (DIRECT) thêm vào Job' })
  readonly itemId!: string;

  @NumberField({ isPositive: true, description: 'Số lượng cần cho Job' })
  readonly requiredQty!: number;
}
