import { Exclude, Expose } from 'class-transformer';

import {
  DateField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductGroupResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Product group code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Product group name' })
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  description!: string | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
