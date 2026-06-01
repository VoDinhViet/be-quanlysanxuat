import { Exclude, Expose, Type } from 'class-transformer';

import {
  ClassFieldOptional,
  DateField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductOptionResDto } from './product-option.res.dto';

@Exclude()
export class BomLineResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDField()
  productRevisionId!: string;

  @Expose()
  @UUIDField()
  parentItemId!: string;

  @Expose()
  @UUIDField()
  childItemId!: string;

  @Expose()
  @StringField()
  qty!: string;

  @Expose()
  @StringField()
  scrapRate!: string;

  @Expose()
  @UUIDField()
  unitId!: string;

  @Expose()
  @Type(() => ProductOptionResDto)
  @ClassFieldOptional(() => ProductOptionResDto, { nullable: true })
  unit!: ProductOptionResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
