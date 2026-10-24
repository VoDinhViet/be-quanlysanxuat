import {
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class PostInventoryIssueReqDto {
  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú xác nhận xuất' })
  readonly note?: string;

  @UUIDFieldOptional({
    each: true,
    description:
      'Ảnh/file bằng chứng (from POST /files, type=INVENTORY_ISSUE_EVIDENCE)',
  })
  readonly fileIds?: string[];
}
