import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
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
  @ClassField(() => ProductRefResDto)
  product!: ProductRefResDto;
}
