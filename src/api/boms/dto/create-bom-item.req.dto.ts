import { BomItemType } from '../../../database/schemas';
import {
  EnumField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateBomItemReqDto {
  @EnumField(() => BomItemType, { description: 'WIP → PRODUCT, RM → MATERIAL' })
  readonly itemType!: BomItemType;

  @UUIDField({
    description:
      'Id of the linked product (WIP) or material (RM), per itemType',
  })
  readonly itemId!: string;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Parent bom_items id; omit/null for a top-level item (child of the FG root)',
  })
  readonly parentId?: string | null;

  @NumberField({
    isPositive: true,
    description: 'SL — WIP: số nguyên, RM: có thể thập phân',
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
