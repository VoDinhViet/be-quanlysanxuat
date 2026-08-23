import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemUnitField } from '../../items/dto/item-unit.field';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';

@Exclude()
export class InventoryRequisitionItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ItemUnitField()
  item!: ItemUnitRefResDto;

  @Expose()
  @NumberField({ description: 'SL lãnh' })
  quantity!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'SL BOM tại thời điểm đọc, null nếu phiếu không gắn Job',
  })
  bomQuantity!: number | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'Đã lãnh (mọi phiếu ISSUED khác cùng Job), null nếu phiếu không gắn Job',
  })
  issuedQuantity!: number | null;

  @Expose()
  @NumberField({ description: 'Tồn thực tế' })
  onHand!: number;

  @Expose()
  @NumberField({ description: 'Đã giữ tại thời điểm đọc' })
  reservedQuantity!: number;

  @Expose()
  @NumberField({ description: 'Có thể lãnh = Tồn thực tế − Đã giữ' })
  issuableQuantity!: number;

  @Expose()
  @NumberField({ description: 'Khả dụng, có thể âm, chỉ tham khảo' })
  availableQuantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;
}
