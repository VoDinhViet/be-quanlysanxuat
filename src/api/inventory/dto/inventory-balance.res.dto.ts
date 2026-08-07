import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  DateField,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { WarehouseRefResDto } from '../../warehouses/dto/warehouse-ref.res.dto';

@Exclude()
export class InventoryBalanceResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => WarehouseRefResDto)
  warehouse!: WarehouseRefResDto;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @NumberField({ description: 'Tồn hiện tại' })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'Số lượng giữ chỗ — luôn 0 ở giai đoạn này' })
  reservedQuantity!: number;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
