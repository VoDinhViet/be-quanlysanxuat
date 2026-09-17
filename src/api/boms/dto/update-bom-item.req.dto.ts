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

  @UUIDFieldOptional({
    nullable: true,
    description:
      'ĐVT riêng của node — chỉ node COMPONENT (E271 nếu gửi cho node khác). Null xoá ĐVT đã gán',
  })
  readonly unitId?: string | null;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Ảnh riêng của node — chỉ node COMPONENT (E271 nếu gửi cho node khác). Null xoá ảnh đã gán; file cũ không bị xoá khỏi registry',
  })
  readonly imageFileId?: string | null;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
