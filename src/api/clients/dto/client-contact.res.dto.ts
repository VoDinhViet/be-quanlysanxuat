import { Exclude, Expose } from 'class-transformer';

import {
  BooleanField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ClientContactResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Contact full name' })
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  position!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  phoneNumber!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  email!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @BooleanField({ description: 'Whether this is the primary contact' })
  isPrimary!: boolean;
}
