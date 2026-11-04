import { Exclude, Expose } from 'class-transformer';

import { DateField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class HoldDraftFilesResDto {
  @Expose()
  @DateField({
    description: 'Hạn giữ các file của bản nháp, tính từ lần lưu này',
  })
  expiresAt!: Date;

  @Expose()
  @UUIDField({
    each: true,
    description:
      'File không còn trong hệ thống (đã bị dọn), form cần gỡ khỏi bản nháp',
  })
  missingFileIds!: string[];
}
