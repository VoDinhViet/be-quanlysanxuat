import { DateField } from '../../../decorators/field.decorators';

export class UpdatePurchaseRequestNeededDateReqDto {
  @DateField({ description: 'Ngày cần vật tư' })
  readonly neededDate!: Date;
}
