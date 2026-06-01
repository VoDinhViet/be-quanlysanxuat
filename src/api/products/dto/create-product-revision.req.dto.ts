import { StringField, StringFieldOptional } from '../../../decorators/field.decorators';

export class CreateProductRevisionReqDto {
  @StringField({ maxLength: 50 })
  revisionNo!: string;

  @StringFieldOptional({ nullable: true })
  note?: string | null;
}
