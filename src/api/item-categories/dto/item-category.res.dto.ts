import { Exclude, Expose } from 'class-transformer';

import {
  DateField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ItemCategoryResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Category code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Category name, e.g. Bulong' })
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  description!: string | null;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
