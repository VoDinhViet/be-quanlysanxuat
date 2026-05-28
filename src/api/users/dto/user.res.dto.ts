import { Exclude, Expose, Type } from 'class-transformer';

import { AccountRoleResDto } from '../../auth/dto/role.res.dto';
import { UserStatus } from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  EmailField,
  EnumField,
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
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
