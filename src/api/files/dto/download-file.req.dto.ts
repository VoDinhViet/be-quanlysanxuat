import { NumberField, StringField } from '../../../decorators/field.decorators';

/**
 * The signed-URL query pair. `FileSignatureGuard` already validated both from the raw request
 * (guards run before pipes), so this exists for Swagger and for typed access in the handler —
 * it is not the security boundary.
 */
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
