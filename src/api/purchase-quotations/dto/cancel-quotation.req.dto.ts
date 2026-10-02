import { StringField } from '../../../decorators/field.decorators';

export class CancelQuotationReqDto {
  @StringField({ maxLength: 1000, description: 'Lý do huỷ' })
  readonly reason!: string;
}
