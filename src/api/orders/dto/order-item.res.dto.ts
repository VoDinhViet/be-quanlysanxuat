import { Exclude, Expose, Type } from 'class-transformer';

import {
  ClassFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductFileResDto } from '../../products/dto/product-file.res.dto';

@Exclude()
export class OrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDField()
  productId!: string;

  @Expose()
  @StringField()
  productCode!: string;

  @Expose()
  @StringField()
  productName!: string;

  @Expose()
  @StringField()
  unit!: string;

  @Expose()
  @NumberField()
  quantity!: number;

  @Expose()
  @NumberField()
  unitPrice!: number;

  @Expose()
  @NumberField()
  lineTotal!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  imageUrl!: string | null;

  @Expose()
  @Type(() => ProductFileResDto)
  @ClassFieldOptional(() => ProductFileResDto, { each: true })
  technicalFiles!: ProductFileResDto[];
}
