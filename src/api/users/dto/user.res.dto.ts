import { Exclude, Expose } from 'class-transformer';

import { UserGender, UserStatus } from '../../../database/schemas';
import {
  DateField,
  DateFieldOptional,
  EmailField,
  EnumField,
  EnumFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class UserResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'User unique code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Username' })
  username!: string;

  @Expose()
  @EmailField()
  email!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  fullName!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  phoneNumber!: string | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  dateOfBirth!: Date | null;

  @Expose()
  @EnumFieldOptional(() => UserGender, { nullable: true })
  gender!: UserGender | null;

  @Expose()
  @EnumField(() => UserStatus)
  status!: UserStatus;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
