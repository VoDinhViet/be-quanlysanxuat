import { UploadType } from '../../../database/schemas';
import { EnumField } from '../../../decorators/field.decorators';

/**
 * Sent as a **query** param, not a multipart field. Two reasons: a query param is readable by a
 * guard (guards run before `FileInterceptor` parses the body), which is what a future
 * permission-per-type check would need; and keeping it there now means turning that check on later
 * costs the frontend nothing.
 */
export class UploadFileReqDto {
  @EnumField(() => UploadType, { description: 'What this file is being uploaded for' })
  readonly type!: UploadType;
}
