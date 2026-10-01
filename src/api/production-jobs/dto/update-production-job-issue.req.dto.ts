import { NumberField } from '../../../decorators/field.decorators';

export class UpdateProductionJobIssueReqDto {
  @NumberField({ isPositive: true, description: 'Số lượng cần cho Job' })
  readonly requiredQty!: number;
}
