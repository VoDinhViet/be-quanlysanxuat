import { Exclude, Expose } from 'class-transformer';

import { InventoryItemType } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { MaterialRefResDto } from '../../materials/dto/material-ref.res.dto';
import { ProductRefResDto } from '../../products/dto/product-ref.res.dto';
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
  @EnumField(() => InventoryItemType)
  itemType!: InventoryItemType;

  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, { nullable: true })
  product!: ProductRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => MaterialRefResDto, { nullable: true })
  material!: MaterialRefResDto | null;

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
