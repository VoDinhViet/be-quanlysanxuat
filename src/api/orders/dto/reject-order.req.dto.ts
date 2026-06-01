import { StringField } from '../../../decorators/field.decorators';

export class RejectOrderReqDto {
  @StringField()
  rejectedReason!: string;
}
