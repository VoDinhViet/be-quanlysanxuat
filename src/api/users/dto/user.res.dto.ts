import { Exclude, Expose, Type } from 'class-transformer';

import { RoleResDto } from '../../auth/dto/role.res.dto';
import { UserGender, UserStatus } from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EmailField,
  EnumField,
  EnumFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
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
  @UUIDFieldOptional({ nullable: true })
  roleId!: string | null;

  @Expose()
  @EnumField(() => UserStatus)
  status!: UserStatus;

  @Expose()
  @Type(() => RoleResDto)
  @ClassFieldOptional(() => RoleResDto, { nullable: true })
  role!: RoleResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
