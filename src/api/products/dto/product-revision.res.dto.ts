import { Exclude, Expose } from 'class-transformer';

import { DateField, StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class ProductRevisionResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  revisionNo!: string;

  @Expose()
  @DateField()
  createdAt!: Date;
}
