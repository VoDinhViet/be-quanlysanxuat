import { MaterialStatus, MaterialType } from '../../../database/schemas';
import {
  ClassFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { MaterialAttachmentReqDto } from './material-attachment.req.dto';

export class CreateMaterialReqDto {
  @StringField({ maxLength: 255 })
  readonly name!: string;

  @UUIDField({ description: 'Unit (ĐVT) id' })
  readonly unitId!: string;

  @UUIDField({ description: 'Material group id' })
  readonly materialGroupId!: string;

  @EnumFieldOptional(() => MaterialType, { description: 'Defaults to INTERNAL' })
  readonly type?: MaterialType;

  // Required only when type is CLIENT (enforced in the service, E040).
  @UUIDFieldOptional({ nullable: true, description: 'Client id (required when type=CLIENT)' })
  readonly clientId?: string | null;

  @StringFieldOptional({ maxLength: 50, description: 'Auto-generated (VTxxxx) if omitted' })
  readonly code?: string;

  @StringFieldOptional({
    maxLength: 500,
    nullable: true,
    description: 'Image URL (from POST /uploads)',
  })
  readonly imageUrl?: string | null;

  @EnumFieldOptional(() => MaterialStatus, { description: 'Defaults to ACTIVE' })
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

  @NumberFieldOptional({ min: 0, nullable: true, description: 'Specific weight' })
  readonly specificWeight?: number | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly colorSurface?: string | null;

  @StringFieldOptional({ maxLength: 2000, nullable: true })
  readonly description?: string | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  readonly origin?: string | null;

  @UUIDFieldOptional({ nullable: true, description: 'Preferred supplier id' })
  readonly preferredSupplierId?: string | null;

  @StringFieldOptional({ maxLength: 100, nullable: true })
  readonly leadTime?: string | null;

  @ClassFieldOptional(() => MaterialAttachmentReqDto, {
    each: true,
    description: 'Images & documents',
  })
  readonly attachments?: MaterialAttachmentReqDto[];
}
