import {
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateBomItemReqDto {
  @StringFieldOptional({
    maxLength: 50,
    description:
      'Mã node — chỉ node COMPONENT (E271 nếu gửi cho node CONSUMABLE)',
  })
  readonly code?: string;

  @StringFieldOptional({
    maxLength: 255,
    description:
      'Tên node — chỉ node COMPONENT (E271 nếu gửi cho node CONSUMABLE)',
  })
  readonly name?: string;

  @NumberFieldOptional({
    isPositive: true,
    description:
      'SL — nguyên nếu node là COMPONENT (E055 nếu lẻ), có thể lẻ nếu là CONSUMABLE',
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
