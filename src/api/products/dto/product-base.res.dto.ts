import { Exclude, Expose } from 'class-transformer';

import { ProductStatus, ProductType } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductBaseResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã sản phẩm' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên sản phẩm' })
  name!: string;

  @Expose()
  @EnumField(() => ProductType)
  type!: ProductType;

  @Expose()
  @EnumField(() => ProductStatus)
  status!: ProductStatus;

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
