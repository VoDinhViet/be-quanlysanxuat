import { StringField } from '../../../decorators/field.decorators';

export class CancelPaymentRequestReqDto {
  @StringField({ maxLength: 1000, description: 'Lý do huỷ' })
  readonly reason!: string;
}
