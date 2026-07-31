import { MaterialStatus, MaterialType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateMaterialReqDto {
  @StringField({ maxLength: 255 })
  readonly name!: string;

  @UUIDField({ description: 'Unit (ĐVT) id' })
  readonly unitId!: string;

  @UUIDField({ description: 'Material group id' })
  readonly materialGroupId!: string;

  @EnumFieldOptional(() => MaterialType, {
    description: 'Defaults to INTERNAL',
  })
  readonly type?: MaterialType;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Client id (required when type=CLIENT)',
  })
  readonly clientId?: string | null;

  @StringFieldOptional({
    maxLength: 50,
    description: 'Auto-generated (VTxxxx) if omitted',
  })
  readonly code?: string;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Image file id (from POST /files)',
  })
  readonly imageFileId?: string | null;

  @EnumFieldOptional(() => MaterialStatus, {
    description: 'Defaults to ACTIVE',
  })
  readonly status?: MaterialStatus;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

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
    description: 'Attachment file ids (from POST /files, kind=DOCUMENT)',
  })
  readonly attachmentFileIds?: string[];

  @NumberFieldOptional({
    min: 0,
    description:
      'Định mức tồn tối thiểu — dùng tính trạng thái tồn kho vật tư. Mặc định 0',
  })
  readonly minStock?: number;

  @UUIDFieldOptional({
    nullable: true,
    description: 'NCC chính (nullable)',
  })
  readonly supplierId?: string | null;
}
