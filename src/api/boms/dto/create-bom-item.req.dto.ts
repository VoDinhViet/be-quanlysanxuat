import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateBomItemReqDto {
  @UUIDField({ description: 'Id of the linked WIP product' })
  readonly productId!: string;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Parent bom_items id; omit/null for a top-level item (child of the FG root)',
  })
  readonly parentId?: string | null;

  @NumberField({
    int: true,
    isPositive: true,
    description: 'SL — số nguyên (mọi node giờ luôn là WIP)',
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
