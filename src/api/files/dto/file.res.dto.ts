import { Exclude, Expose, Transform } from 'class-transformer';

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
  @Transform(
    ({ obj }: { obj: { storageKey?: string } }) =>
      obj.storageKey ? `/${obj.storageKey}` : null,
    // `toClassOnly` bắt buộc: `ClassSerializerInterceptor` serialize DTO thêm một lần, lúc đó
    // `obj` là instance DTO (không có `storageKey`, cố ý không `@Expose()`) nên transform không
    // giới hạn sẽ ghi đè `url` đã resolve thành null — cùng lý do `FileField` (`file.field.ts`)
    // đã ghi `toClassOnly` cho chính lỗi này.
    { toClassOnly: true },
  )
  @StringField({
    description:
      'Public, permanent static file URL, e.g. /2026/07/20/<uuid>.png — usable directly as an ' +
      '<img src>. Served by ServeStaticModule, not the API.',
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
