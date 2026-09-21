import { StringField } from '../../../decorators/field.decorators';

export class RejectInventoryRequisitionReqDto {
  @StringField({ maxLength: 1000, description: 'Lý do từ chối' })
  readonly reason!: string;
}
