import { ArrayMaxSize, IsArray } from 'class-validator';

import { UUIDField } from '../../../decorators/field.decorators';

const MAX_DRAFT_FILES = 500;

export class DraftFilesReqDto {
  // `each` của `UUIDField` vẫn nhận một chuỗi UUID đơn lẻ, nên phải chặn riêng kiểu mảng.
  @IsArray()
  @ArrayMaxSize(MAX_DRAFT_FILES)
  @UUIDField({
    each: true,
    description: `Các file đang nằm trong bản nháp form, tối đa ${MAX_DRAFT_FILES}`,
  })
  readonly fileIds!: string[];
}
