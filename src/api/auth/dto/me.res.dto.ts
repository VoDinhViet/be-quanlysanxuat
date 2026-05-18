import { Exclude, Expose, Type } from 'class-transformer';

import {
  ClassFieldOptional,
  DateField,
  EmailField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { UserStatus } from '../../../database/schemas';
import { AccountRoleResDto } from './role.res.dto';

@Exclude()
export class MeResDto {
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
  @UUIDFieldOptional({ nullable: true })
  roleId!: string | null;

  @Expose()
  @EnumField(() => UserStatus)
  status!: UserStatus;

  @Expose()
  @Type(() => AccountRoleResDto)
  @ClassFieldOptional(() => AccountRoleResDto, { nullable: true })
  role!: AccountRoleResDto | null;

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
