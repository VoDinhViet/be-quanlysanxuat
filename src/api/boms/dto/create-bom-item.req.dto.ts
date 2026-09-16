import { BomType } from '../../../database/schemas';
import {
  EnumField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateBomItemReqDto {
  @EnumField(() => BomType, {
    description:
      'COMPONENT: node cấu trúc con — gửi code + name, không gửi itemId; CONSUMABLE: lá vật tư — gửi itemId, ' +
      'không gửi code/name. Sai hình dạng → E271',
  })
  readonly type!: BomType;

  @UUIDFieldOptional({
    description:
      'Id vật tư (type = CONSUMABLE) — phải là item type CONSUMABLE (E270)',
  })
  readonly itemId?: string;

  @StringFieldOptional({
    maxLength: 50,
    description:
      'Mã node (type = COMPONENT) — nhập tay, riêng cho vị trí này trong cây',
  })
  readonly code?: string;

  @StringFieldOptional({
    maxLength: 255,
    description: 'Tên node (type = COMPONENT)',
  })
  readonly name?: string;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Parent bom_items id; omit/null for a top-level item (child of the FG root)',
  })
  readonly parentId?: string | null;

  @NumberField({
    isPositive: true,
    description:
      'SL — nguyên nếu type là COMPONENT (E055 nếu lẻ), có thể lẻ nếu type là CONSUMABLE',
  })
  readonly quantity!: number;

  @NumberFieldOptional({
    int: true,
    min: 0,
    description: 'Sibling order; defaults to 0',
  })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Drawing (bản vẽ) file id, specific to this node (from POST /files?type=BOM_ITEM_DRAWING)',
  })
  readonly drawingFileId?: string | null;
}
