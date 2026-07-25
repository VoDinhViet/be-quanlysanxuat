import {
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/**
 * Edits an existing node's basic info — the mockup only supports inline SL editing, no
 * move/re-parent. `itemType`/`itemId`/`parentId` are immutable (delete + re-add to change
 * identity or position in the tree).
 */
export class UpdateBomItemReqDto {
  @NumberFieldOptional({
    isPositive: true,
    description: 'SL — số nguyên nếu node là WIP',
  })
  readonly quantity?: number;

  @NumberFieldOptional({ int: true, min: 0 })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;

  // Explicit `null` clears the drawing (and deletes the old file); omitted leaves it untouched.
  @UUIDFieldOptional({
    nullable: true,
    description:
      'Drawing (bản vẽ) file id (from POST /files?type=BOM_ITEM_DRAWING). Replacing it deletes ' +
      'the previous file; null clears it.',
  })
  readonly drawingFileId?: string | null;
}
