import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

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
}
