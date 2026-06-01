import { Exclude, Expose } from 'class-transformer';

import {
  EmailFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class OrderClientResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  fullName!: string;

  @Expose()
  @EmailFieldOptional({ nullable: true })
  email!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  phoneNumber!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  taxCode!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  companyName!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  address!: string | null;
}
