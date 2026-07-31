import { UploadType } from '../../../database/schemas';
import { EnumField } from '../../../decorators/field.decorators';

export class UploadFileReqDto {
  @EnumField(() => UploadType, {
    description: 'What this file is being uploaded for',
  })
  readonly type!: UploadType;
}
