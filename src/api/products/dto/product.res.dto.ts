import { Exclude, Expose, Type } from 'class-transformer';

import {
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductItemType, ProductStatus } from '../../../database/schemas';
import { ProductClientResDto } from './product-client.res.dto';
import { ProductOptionResDto } from './product-option.res.dto';
import { ProductRevisionResDto } from './product-revision.res.dto';

@Exclude()
export class ProductResDto {
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
  @EnumField(() => ProductItemType)
  itemType!: ProductItemType;

  @Expose()
  @EnumField(() => ProductStatus)
  status!: ProductStatus;

  @Expose()
  @StringFieldOptional({ nullable: true })
  imageUrl!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @Type(() => ProductOptionResDto)
  @ClassFieldOptional(() => ProductOptionResDto, { nullable: true })
  unit!: ProductOptionResDto | null;

  @Expose()
  @Type(() => ProductClientResDto)
  @ClassFieldOptional(() => ProductClientResDto, { nullable: true })
  client!: ProductClientResDto | null;

  @Expose()
  @Type(() => ProductRevisionResDto)
  @ClassFieldOptional(() => ProductRevisionResDto, { nullable: true })
  currentRevision!: ProductRevisionResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
