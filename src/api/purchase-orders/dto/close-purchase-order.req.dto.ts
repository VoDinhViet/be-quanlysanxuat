import { StringField } from '../../../decorators/field.decorators';

export class ClosePurchaseOrderReqDto {
  @StringField({ maxLength: 1000, description: 'Lý do đóng sớm' })
  readonly reason!: string;
}
