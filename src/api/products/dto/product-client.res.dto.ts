import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class ProductClientResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  fullName!: string;
}
