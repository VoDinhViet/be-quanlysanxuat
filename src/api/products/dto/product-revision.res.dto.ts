import { Exclude, Expose } from 'class-transformer';

import {
  DateField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductRevisionResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  revisionNo!: string;

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
