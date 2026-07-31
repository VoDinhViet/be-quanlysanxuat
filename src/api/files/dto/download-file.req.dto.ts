import { NumberField, StringField } from '../../../decorators/field.decorators';

export class DownloadFileReqDto {
  @NumberField({
    int: true,
    description: 'Unix seconds the signature expires at',
  })
  readonly exp!: number;

  @StringField({
    description: 'HMAC-SHA256 signature over `<fileId>:<exp>`, base64url',
  })
  readonly sig!: string;
}
