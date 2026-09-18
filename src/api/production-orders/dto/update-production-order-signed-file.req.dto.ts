import { UUIDFieldOptional } from '../../../decorators/field.decorators';

export class UpdateProductionOrderSignedFileReqDto {
  @UUIDFieldOptional({
    nullable: true,
    description: 'File ID của bản scan/PDF LSX đã ký — null để xóa file',
  })
  readonly signedFileId?: string | null;
}
