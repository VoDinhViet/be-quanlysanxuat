import { ItemStatus, ItemType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateItemReqDto {
  @StringField({ description: 'Tên hàng hoá', maxLength: 255 })
  name!: string;

  @UUIDField({ description: 'Unit id (ĐVT)' })
  unitId!: string;

  @StringFieldOptional({
    description: 'Mã hàng hoá; tự sinh nếu bỏ trống',
    maxLength: 50,
  })
  code?: string;

  @EnumFieldOptional(() => ItemType, {
    description:
      'FG (thành phẩm) / WIP (bán thành phẩm) / RM (vật tư); mặc định FG',
  })
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
    description:
      'Định mức tồn tối thiểu — chỉ có ý nghĩa với RM, dùng tính trạng thái tồn kho. Mặc định 0',
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
