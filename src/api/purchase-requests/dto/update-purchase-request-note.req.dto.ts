import { StringField } from '../../../decorators/field.decorators';

export class UpdatePurchaseRequestNoteReqDto {
  @StringField({ nullable: true, maxLength: 1000 })
  readonly note!: string | null;
}
