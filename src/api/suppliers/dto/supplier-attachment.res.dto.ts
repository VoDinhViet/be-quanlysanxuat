import { Exclude, Expose } from 'class-transformer';

import {
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class SupplierAttachmentResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'File URL' })
  url!: string;

  @Expose()
  @StringField({ description: 'Original filename' })
  filename!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  mimetype!: string | null;

  @Expose()
  @NumberFieldOptional({ nullable: true })
  size!: number | null;
}
