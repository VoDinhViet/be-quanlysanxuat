import { Exclude, Expose } from 'class-transformer';

import { ClientType } from '../../../database/schemas';
import {
  DateField,
  EmailFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ClientResDto {
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
  @EnumField(() => ClientType)
  clientType!: ClientType;

  @Expose()
  @StringFieldOptional({ nullable: true })
  taxCode!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  companyName!: string | null;

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
