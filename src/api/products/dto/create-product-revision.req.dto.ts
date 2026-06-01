import {
  StringField,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateProductRevisionReqDto {
  @StringField({ maxLength: 50 })
  revisionNo!: string;

  @UUIDFieldOptional()
  copyFromRevisionId?: string;

  @StringFieldOptional({ nullable: true })
  note?: string | null;
}
