import {
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

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

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Drawing (bản vẽ) file id (from POST /files?type=BOM_ITEM_DRAWING). Replacing it deletes ' +
      'the previous file; null clears it.',
  })
  readonly drawingFileId?: string | null;
}
