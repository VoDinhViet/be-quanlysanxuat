import {
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class SupplierAttachmentReqDto {
  @StringField({ description: 'File URL (from POST /uploads/document)', maxLength: 500 })
  url!: string;

  @StringField({ description: 'Original filename', maxLength: 255 })
  filename!: string;

  @StringFieldOptional({ description: 'MIME type', nullable: true, maxLength: 100 })
  mimetype?: string | null;

  @NumberFieldOptional({ description: 'File size in bytes', nullable: true, min: 0, int: true })
  size?: number | null;
}
