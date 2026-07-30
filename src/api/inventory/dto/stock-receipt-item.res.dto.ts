import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  NumberField,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { MaterialRefResDto } from '../../materials/dto/material-ref.res.dto';
import { ProductRefResDto } from '../../products/dto/product-ref.res.dto';

@Exclude()
export class StockReceiptItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({ description: 'Số lượng' })
  quantity!: number;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'Dòng đơn hàng được giao (chỉ có trên phiếu xuất DELIVERY)',
  })
  orderItemId!: string | null;

  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, { nullable: true })
  product!: ProductRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => MaterialRefResDto, { nullable: true })
  material!: MaterialRefResDto | null;
}
