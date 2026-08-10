import { StringField } from '../../../decorators/field.decorators';

export class UpdateProductionOrderNoteReqDto {
  @StringField({ nullable: true, maxLength: 1000 })
  readonly note!: string | null;
}
