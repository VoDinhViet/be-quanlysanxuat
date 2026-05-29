import { Exclude, Expose, Type } from 'class-transformer';

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
import { UserGender, UserStatus } from '../../../database/schemas';
import { RoleResDto } from './role.res.dto';

@Exclude()
export class CurrentUserResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @EmailField()
  email!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  fullName!: string | null;

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
  @StringField({ each: true })
  permissions!: string[];

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
