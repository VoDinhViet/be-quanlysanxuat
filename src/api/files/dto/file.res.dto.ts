import { Exclude, Expose, Transform } from 'class-transformer';

import { resolveFileUrl } from '../file-url-resolver';
import { FileKind, UploadType } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class FileResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { id?: string } }) =>
    obj.id ? resolveFileUrl(obj.id) : null,
  )
  @StringField({
    description:
      'Signed, expiring download URL, e.g. /api/files/<id>/download?exp=...&sig=... — usable ' +
      'directly as an <img src>. Do not cache or persist it: it stops working after ' +
      'UPLOAD_URL_TTL seconds, re-read the owning entity to get a fresh one.',
  })
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
