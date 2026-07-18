import {
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class MaterialAttachmentReqDto {
  @StringField({
    maxLength: 500,
    description: 'File URL (from POST /uploads or /uploads/document)',
  })
  readonly url!: string;

  @StringField({ maxLength: 255 })
  readonly filename!: string;

  @StringFieldOptional({ maxLength: 100, nullable: true })
  readonly mimetype?: string | null;

  @NumberFieldOptional({ int: true, min: 0, nullable: true })
  readonly size?: number | null;
}
