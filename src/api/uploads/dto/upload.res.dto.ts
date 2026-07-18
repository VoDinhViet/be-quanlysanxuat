import { Exclude, Expose } from 'class-transformer';

import { NumberField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class UploadResDto {
  @Expose()
  @StringField({ description: 'Relative URL to fetch the file, e.g. /uploads/<uuid>.png' })
  url!: string;

  @Expose()
  @StringField({ description: 'Generated filename on disk' })
  filename!: string;

  @Expose()
  @StringField({ description: 'MIME type, e.g. image/png' })
  mimetype!: string;

  @Expose()
  @NumberField({ description: 'File size in bytes' })
  size!: number;
}
