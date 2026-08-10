import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';

@Exclude()
export class InventoryReceiptItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @NumberField({ description: 'Số lượng' })
  quantity!: number;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Đơn giá' })
  unitPrice!: number | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @NumberField({ description: 'Tồn thực tế (gộp mọi kho), đọc lúc gọi API' })
  onHand!: number;

  @Expose()
  @NumberField({
    description:
      'Nhu cầu BOM — tổng requiredQty của Job liên quan, hoặc mọi Job của LSX nếu không có Job cụ thể',
  })
  bomDemand!: number;

  @Expose()
  @NumberField({ description: 'Tồn khả dụng = onHand − bomDemand, có thể âm' })
  available!: number;

  @Expose()
  @NumberField({
    description:
      'Phần tồn thực tế bị nhu cầu LSX này chiếm = min(onHand, bomDemand)',
  })
  fromStock!: number;
}
