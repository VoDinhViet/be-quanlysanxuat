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
export class OrderProductOptionResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  unit!: string | null;

  @Expose()
  @NumberField()
  defaultSalePrice!: number;

  @Expose()
  @Type(() => ProductFileResDto)
  @ClassFieldOptional(() => ProductFileResDto, { each: true })
  technicalFiles!: ProductFileResDto[];
}
