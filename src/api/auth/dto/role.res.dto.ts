import { Exclude, Expose } from 'class-transformer';

import {
  BooleanField,
  DateField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class RoleResDto {
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
  @StringFieldOptional({ nullable: true })
  description!: string | null;

  @Expose()
  @BooleanField()
  isActive!: boolean;

  @Expose()
  @DateField()
  createdAt!: Date;
}
