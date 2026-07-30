import { MaterialStatus, MaterialType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/** No `code` field — immutable after creation (see `materials` schema comment). */
export class UpdateMaterialReqDto {
  @StringFieldOptional({ maxLength: 255 })
  readonly name?: string;

  @UUIDFieldOptional({ description: 'Unit (ĐVT) id' })
  readonly unitId?: string;

  @UUIDFieldOptional({ description: 'Material group id' })
  readonly materialGroupId?: string;

  @EnumFieldOptional(() => MaterialType)
  readonly type?: MaterialType;

  // Required only when the effective type is CLIENT (enforced in the service, E040).
  @UUIDFieldOptional({
    nullable: true,
    description: 'Client id (required when effective type is CLIENT)',
  })
  readonly clientId?: string | null;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Image file id (from POST /files)',
  })
  readonly imageFileId?: string | null;

  @EnumFieldOptional(() => MaterialStatus)
  readonly status?: MaterialStatus;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  // Extended information (all optional)
  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly materialGrade?: string | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly technicalStandard?: string | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly dimensions?: string | null;

  @NumberFieldOptional({
    min: 0,
    nullable: true,
    description: 'Specific weight',
  })
  readonly specificWeight?: number | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly colorSurface?: string | null;

  @StringFieldOptional({ maxLength: 2000, nullable: true })
  readonly description?: string | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly origin?: string | null;

  @StringFieldOptional({ maxLength: 100, nullable: true })
  readonly leadTime?: string | null;

  @UUIDFieldOptional({
    each: true,
    description:
      'Attachment file ids (from POST /files, kind=DOCUMENT); replaces the full set',
  })
  readonly attachmentFileIds?: string[];

  @NumberFieldOptional({
    min: 0,
    description: 'Định mức tồn tối thiểu — dùng tính trạng thái tồn kho vật tư',
  })
  readonly minStock?: number;

  @UUIDFieldOptional({
    nullable: true,
    description: 'NCC chính (nullable)',
  })
  readonly supplierId?: string | null;
}
