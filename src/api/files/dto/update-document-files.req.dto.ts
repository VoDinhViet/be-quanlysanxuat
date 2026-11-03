import { ArrayMaxSize, IsArray } from 'class-validator';

import { UUIDField } from '../../../decorators/field.decorators';

const MAX_DOCUMENT_FILES = 20;

export class UpdateDocumentFilesReqDto {
  // `each` của `UUIDField` vẫn nhận một chuỗi UUID đơn lẻ, nên phải chặn riêng kiểu mảng.
  @IsArray()
  @ArrayMaxSize(MAX_DOCUMENT_FILES)
  @UUIDField({
    each: true,
    description: `Toàn bộ file của phiếu sau khi đổi, tối đa ${MAX_DOCUMENT_FILES}; mảng rỗng để bỏ hết`,
  })
  readonly fileIds!: string[];
}
