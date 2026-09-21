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
export class PageInventoryReceiptItemResDto {
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
}
