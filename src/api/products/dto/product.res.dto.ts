import { Exclude, Expose } from 'class-transformer';

import { ProductStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductCreatorResDto } from './product-creator.res.dto';
import { ProductRefResDto } from './product-ref.res.dto';

@Exclude()
export class ProductResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Product code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Product name' })
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  imageUrl!: string | null;

  @Expose()
  @StringField({ description: 'Revision, e.g. R01' })
  revision!: string;

  @Expose()
  @EnumField(() => ProductStatus)
  status!: ProductStatus;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, { nullable: true })
  client!: ProductRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, { nullable: true })
  group!: ProductRefResDto | null;

  @Expose()
  @ClassField(() => ProductRefResDto)
  unit!: ProductRefResDto;

  @Expose()
  @ClassFieldOptional(() => ProductCreatorResDto, { nullable: true })
  creator!: ProductCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
