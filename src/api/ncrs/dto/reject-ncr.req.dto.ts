import { StringField } from '../../../decorators/field.decorators';

export class RejectNcrReqDto {
  @StringField({ maxLength: 1000, description: 'Lý do không duyệt' })
  readonly reason!: string;
}
