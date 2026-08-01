import { Exclude, Expose } from 'class-transformer';

import { ClientStatus } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ClientBaseResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Client code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Client name' })
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  taxCode!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  phoneNumber!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  email!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  address!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @EnumField(() => ClientStatus)
  status!: ClientStatus;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
