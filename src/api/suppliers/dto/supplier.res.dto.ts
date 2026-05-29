import { Exclude, Expose } from 'class-transformer';

import {
  DateField,
  EmailFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class SupplierResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;

  @Expose()
  @EmailFieldOptional({ nullable: true })
  email!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  phoneNumber!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  address!: string | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
