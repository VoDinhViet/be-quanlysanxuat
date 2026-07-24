import {
  NumberFieldOptional,
  StringFieldOptional,
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
}
