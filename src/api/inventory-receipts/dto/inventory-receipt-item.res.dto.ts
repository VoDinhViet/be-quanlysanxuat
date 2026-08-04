import { Exclude, Expose } from 'class-transformer';

import { InventoryItemType } from '../../../database/schemas';
import {
  ClassFieldOptional,
  EnumField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { MaterialRefResDto } from '../../materials/dto/material-ref.res.dto';
import { ProductRefResDto } from '../../products/dto/product-ref.res.dto';

@Exclude()
export class InventoryReceiptItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

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
  @NumberField({ description: 'Số lượng' })
  quantity!: number;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Đơn giá' })
  unitPrice!: number | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;
}
