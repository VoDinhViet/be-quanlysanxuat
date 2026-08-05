import { Exclude, Expose } from 'class-transformer';

import { ClassFieldOptional } from '../../../decorators/field.decorators';
import { ProductRefResDto } from './product-ref.res.dto';
import { ProductResDto } from './product.res.dto';

@Exclude()
export class ProductDetailResDto extends ProductResDto {
  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, {
    nullable: true,
    description: 'Sản phẩm gốc được sao chép từ (nếu là bản sao)',
  })
  clonedFrom!: ProductRefResDto | null;
}
