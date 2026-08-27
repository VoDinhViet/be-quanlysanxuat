import { ItemStatus, ItemType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateItemReqDto {
  @StringFieldOptional({ description: 'Tên hàng hoá', maxLength: 255 })
  name?: string;

  @UUIDFieldOptional({ description: 'Unit id (ĐVT)' })
  unitId?: string;

  @StringFieldOptional({ description: 'Mã hàng hoá', maxLength: 50 })
  code?: string;

  @EnumFieldOptional(() => ItemType)
  type?: ItemType;

  @UUIDFieldOptional({ description: 'Client id', nullable: true })
  clientId?: string | null;

  @UUIDFieldOptional({
    description: 'Image file id (from POST /files)',
    nullable: true,
  })
  imageFileId?: string | null;

  @EnumFieldOptional(() => ItemStatus)
  status?: ItemStatus;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;

  @UUIDFieldOptional({
    nullable: true,
    description: 'NCC chính — chỉ có ý nghĩa với RM',
  })
  supplierId?: string | null;

  @NumberFieldOptional({
    min: 0,
    description: 'Định mức tồn tối thiểu — chỉ có ý nghĩa với RM',
  })
  minStock?: number;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  materialGrade?: string | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  technicalStandard?: string | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  dimensions?: string | null;

  @NumberFieldOptional({
    min: 0,
    nullable: true,
    description: 'Specific weight',
  })
  specificWeight?: number | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  colorSurface?: string | null;

  @StringFieldOptional({ maxLength: 2000, nullable: true })
  description?: string | null;

  @StringFieldOptional({ maxLength: 255, nullable: true })
  origin?: string | null;

  @StringFieldOptional({ maxLength: 100, nullable: true })
  leadTime?: string | null;

  @UUIDFieldOptional({
    each: true,
    description: 'File ids (from POST /files?type=ITEM_DOCUMENT)',
  })
  fileIds?: string[];
}
