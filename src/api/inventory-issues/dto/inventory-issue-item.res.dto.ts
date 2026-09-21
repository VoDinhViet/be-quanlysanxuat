import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

@Exclude()
export class InventoryIssueItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @NumberField({ description: 'Số lượng' })
  quantity!: number;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'Dòng đơn hàng được giao (chỉ có trên dòng item là FG)',
  })
  orderItemId!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;
}
