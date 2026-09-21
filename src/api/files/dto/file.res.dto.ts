import { Exclude, Expose } from 'class-transformer';

import { FileKind, UploadType } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileUrlField } from './file-url.field';

@Exclude()
export class FileResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @FileUrlField()
  url!: string;

  @Expose()
  @StringField({ description: "Client's original filename" })
  originalName!: string;

  @Expose()
  @StringField({ description: 'MIME type, detected from the file content' })
  mimetype!: string;

  @Expose()
  @NumberField({ int: true, description: 'File size in bytes' })
  size!: number;

  @Expose()
  @EnumField(() => UploadType, {
    description: 'What the file was uploaded for',
  })
  type!: UploadType;

  @Expose()
  @EnumField(() => FileKind)
  kind!: FileKind;

  @Expose()
  @DateField()
  createdAt!: Date;
}
