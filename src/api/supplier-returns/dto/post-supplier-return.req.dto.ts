import {
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class PostSupplierReturnReqDto {
  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú xuất trả' })
  readonly note?: string;

  @UUIDFieldOptional({
    each: true,
    description:
      'File ids đính kèm (from POST /files, type=SUPPLIER_RETURN_EVIDENCE)',
  })
  readonly fileIds?: string[];
}
