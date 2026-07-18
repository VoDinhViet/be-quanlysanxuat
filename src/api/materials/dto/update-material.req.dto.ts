import { MaterialStatus, MaterialType } from '../../../database/schemas';
import {
  ClassFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { MaterialAttachmentReqDto } from './material-attachment.req.dto';

/** `code` is intentionally omitted — a material's code is immutable after creation. */
export class UpdateMaterialReqDto {
  @StringFieldOptional({ maxLength: 255 })
  readonly name?: string;

  @UUIDFieldOptional({ description: 'Unit (ĐVT) id' })
  readonly unitId?: string;

  @UUIDFieldOptional({ description: 'Material group id' })
  readonly materialGroupId?: string;

  @EnumFieldOptional(() => MaterialType)
  readonly type?: MaterialType;

  @UUIDFieldOptional({ nullable: true, description: 'Client id (required when type=CLIENT)' })
  readonly clientId?: string | null;

  @StringFieldOptional({ maxLength: 500, nullable: true })
  readonly imageUrl?: string | null;

  @EnumFieldOptional(() => MaterialStatus, { description: 'Set INACTIVE to deactivate' })
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

  @NumberFieldOptional({ min: 0, nullable: true })
  readonly specificWeight?: number | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly colorSurface?: string | null;

  @StringFieldOptional({ maxLength: 2000, nullable: true })
  readonly description?: string | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly origin?: string | null;

  @UUIDFieldOptional({ nullable: true })
  readonly preferredSupplierId?: string | null;

  @StringFieldOptional({ maxLength: 100, nullable: true })
  readonly leadTime?: string | null;

  @ClassFieldOptional(() => MaterialAttachmentReqDto, { each: true })
  readonly attachments?: MaterialAttachmentReqDto[];
}
