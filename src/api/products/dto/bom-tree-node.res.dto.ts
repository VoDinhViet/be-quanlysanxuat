import { Exclude, Expose, Type } from 'class-transformer';

import {
  BooleanField,
  ClassField,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { ProductItemType } from '../../../database/schemas';
import { ProductOptionResDto } from './product-option.res.dto';

@Exclude()
export class BomTreeNodeResDto {
  @Expose()
  @StringField()
  id!: string;

  @Expose()
  @UUIDFieldOptional({ nullable: true })
  bomLineId!: string | null;

  @Expose()
  @UUIDField()
  productId!: string;

  @Expose()
  @UUIDFieldOptional({ nullable: true })
  parentItemId!: string | null;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  imageUrl!: string | null;

  @Expose()
  @EnumField(() => ProductItemType)
  itemType!: ProductItemType;

  @Expose()
  @StringField()
  qty!: string;

  @Expose()
  @Type(() => ProductOptionResDto)
  @ClassField(() => ProductOptionResDto)
  unit!: ProductOptionResDto;

  @Expose()
  @NumberField({ int: true })
  level!: number;

  @Expose()
  @NumberField({ int: true })
  sortOrder!: number;

  @Expose()
  @BooleanField()
  hasRouting!: boolean;

  @Expose()
  @Type(() => BomTreeNodeResDto)
  @ClassField(() => BomTreeNodeResDto, { each: true })
  children!: BomTreeNodeResDto[];
}
